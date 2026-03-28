import {
  addExpense,
  addWishlistItem,
  deleteWishlistItem,
  getAllWishlist,
  getExpensesForMonth,
  getSettings,
} from '../db.ts';
import type { Expense, WishlistItem } from '../types.ts';
import {
  computeRemainingEnvelope,
  dollarsToCents,
  formatCurrency,
  getToday,
  getYearMonthFromDate,
  WISHLIST_DELAY_MS,
} from '../utils.ts';

let countdownId: number | null = null;
const revokeUrls: string[] = [];

export function cleanup(): void {
  if (countdownId !== null) {
    window.clearInterval(countdownId);
    countdownId = null;
  }
  while (revokeUrls.length > 0) {
    const u = revokeUrls.pop();
    if (u) URL.revokeObjectURL(u);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts?: { className?: string; text?: string },
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (opts?.className) n.className = opts.className;
  if (opts?.text !== undefined) n.textContent = opts.text;
  return n;
}

function randomId(): string {
  return crypto.randomUUID();
}

const MAX_SIDE = 800;

async function resizeImageFile(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const w = bmp.width;
  const h = bmp.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas not supported');
  }
  ctx.drawImage(bmp, 0, 0, tw, th);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Could not encode image'));
      },
      'image/jpeg',
      0.85,
    );
  });
}

function formatCountdown(reminderDate: number): string {
  const ms = reminderDate - Date.now();
  if (ms <= 0) return 'Timer done';
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `${String(days)} day${days === 1 ? '' : 's'} left`;
}

async function getCurrentStash(): Promise<number> {
  const today = getToday();
  const yearMonth = getYearMonthFromDate(today);
  const settings = await getSettings();
  if (!settings || settings.monthlyBudget <= 0) return 0;
  const expenses = await getExpensesForMonth(yearMonth);
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  return computeRemainingEnvelope(
    settings.monthlyBudget,
    yearMonth,
    today,
    totalSpent,
  );
}

type UnlockStatus =
  | { kind: 'no-price' }
  | { kind: 'timer-pending'; daysLeft: number }
  | { kind: 'saving'; stash: number; price: number }
  | { kind: 'unlocked'; stash: number; price: number };

function getUnlockStatus(w: WishlistItem, stash: number): UnlockStatus {
  if (!w.priceCents || w.priceCents <= 0) return { kind: 'no-price' };
  const timerDone = w.reminderDate <= Date.now();
  if (!timerDone) {
    const days = Math.ceil(
      (w.reminderDate - Date.now()) / (24 * 60 * 60 * 1000),
    );
    return { kind: 'timer-pending', daysLeft: days };
  }
  if (stash >= w.priceCents) {
    return { kind: 'unlocked', stash, price: w.priceCents };
  }
  return { kind: 'saving', stash, price: w.priceCents };
}

export async function render(container: HTMLElement): Promise<void> {
  cleanup();
  revokeUrls.length = 0;

  const header = el('header', { className: 'screen-header' });
  header.appendChild(el('h1', { text: 'Wishlist' }));
  container.appendChild(header);

  const stash = await getCurrentStash();
  const stashDisplay = el('div', { className: 'stash-display' });
  const stashLabel = el('p', {
    className: 'stash-display__label',
    text: 'Your stash',
  });
  const stashValue = el('p', {
    className: 'stash-display__value',
    text: formatCurrency(stash),
  });
  if (stash < 0) stashValue.classList.add('balance__value--negative');
  const stashHint = el('p', {
    className: 'stash-display__hint muted',
    text: 'Unspent daily allowance accumulates here.',
  });
  stashDisplay.appendChild(stashLabel);
  stashDisplay.appendChild(stashValue);
  stashDisplay.appendChild(stashHint);
  container.appendChild(stashDisplay);

  const listWrap = el('div', { className: 'wishlist-wrap' });
  container.appendChild(listWrap);

  let formVisible = false;
  const toggleBtn = el('button', { text: '+ Add something new' });
  toggleBtn.type = 'button';
  toggleBtn.className = 'wishlist-add-toggle';

  const formWrap = el('div', { className: 'wishlist-form-wrap' });
  const formInner = el('div');

  const form = el('form', { className: 'form' });
  const titleLabel = el('label', { text: 'What do you want?' });
  titleLabel.htmlFor = 'wtitle';
  const title = el('input');
  title.id = 'wtitle';
  title.type = 'text';
  title.className = 'form-input';
  title.required = true;
  title.maxLength = 200;
  title.placeholder = 'Coffee grinder, book, ...';

  const urlLabel = el('label', { text: 'Link (optional)' });
  urlLabel.htmlFor = 'wurl';
  const urlInput = el('input');
  urlInput.id = 'wurl';
  urlInput.type = 'url';
  urlInput.className = 'form-input';
  urlInput.placeholder = 'https://example.com/product';
  urlInput.autocomplete = 'off';

  const priceLabel = el('label', { text: 'Price (CAD)' });
  priceLabel.htmlFor = 'wprice';
  const price = el('input');
  price.id = 'wprice';
  price.type = 'text';
  price.className = 'form-input';
  price.inputMode = 'decimal';
  price.placeholder = '0.00';
  price.autocomplete = 'off';

  const photoLabel = el('label', { text: 'Photo (optional)' });
  photoLabel.htmlFor = 'wphoto';
  const photo = el('input');
  photo.id = 'wphoto';
  photo.type = 'file';
  photo.accept = 'image/*';

  const err = el('p', { className: 'form-error' });
  err.hidden = true;

  const addBtn = el('button', { text: 'Add to wishlist' });
  addBtn.type = 'submit';
  addBtn.className = 'button button--primary button--full';

  form.appendChild(titleLabel);
  form.appendChild(title);
  form.appendChild(urlLabel);
  form.appendChild(urlInput);
  form.appendChild(priceLabel);
  form.appendChild(price);
  form.appendChild(photoLabel);
  form.appendChild(photo);
  form.appendChild(err);
  form.appendChild(addBtn);
  formInner.appendChild(form);
  formWrap.appendChild(formInner);

  toggleBtn.addEventListener('click', () => {
    formVisible = !formVisible;
    formWrap.classList.toggle('wishlist-form-wrap--open', formVisible);
    toggleBtn.textContent = formVisible ? 'Cancel' : '+ Add something new';
  });

  const renderList = async (): Promise<void> => {
    while (revokeUrls.length > 0) {
      const u = revokeUrls.pop();
      if (u) URL.revokeObjectURL(u);
    }
    listWrap.replaceChildren();

    const currentStash = await getCurrentStash();
    stashValue.textContent = formatCurrency(currentStash);

    const items = await getAllWishlist();
    if (items.length === 0) {
      listWrap.appendChild(
        el('p', {
          className: 'muted',
          text: 'Add something you want. Decide in a week.',
        }),
      );
      listWrap.appendChild(toggleBtn);
      listWrap.appendChild(formWrap);
      return;
    }

    const ul = el('ul', { className: 'wishlist-list' });
    for (const w of items.sort((a, b) => a.reminderDate - b.reminderDate)) {
      const status = getUnlockStatus(w, currentStash);
      const li = el('li', { className: 'wishlist-list__item' });
      const card = el('div', { className: 'wishlist-card' });

      if (status.kind === 'unlocked') {
        card.classList.add('wishlist-card--unlocked');
      } else if (
        status.kind === 'saving' ||
        status.kind === 'timer-pending'
      ) {
        card.classList.add('wishlist-card--locked');
      }

      if (w.image) {
        const url = URL.createObjectURL(w.image);
        revokeUrls.push(url);
        const img = el('img');
        img.className = 'wishlist-card__img';
        img.alt = '';
        img.src = url;
        card.appendChild(img);
      }

      const body = el('div', { className: 'wishlist-card__body' });

      const t = el('h2', {
        className: 'wishlist-card__title',
        text: w.title,
      });
      body.appendChild(t);

      if (w.url) {
        const link = el('a', { className: 'wishlist-card__url' });
        link.href = w.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        try {
          link.textContent = new URL(w.url).hostname;
        } catch {
          link.textContent = w.url;
        }
        body.appendChild(link);
      }

      if (w.priceCents && w.priceCents > 0) {
        const priceTag = el('p', {
          className: 'wishlist-card__price',
          text: formatCurrency(w.priceCents),
        });
        body.appendChild(priceTag);
      }

      if (status.kind === 'timer-pending') {
        const cd = el('p', {
          className: 'wishlist-card__countdown',
          text: `${String(status.daysLeft)} day${status.daysLeft === 1 ? '' : 's'} left`,
        });
        body.appendChild(cd);
      } else if (status.kind === 'saving') {
        const pct = Math.min(
          100,
          Math.round((status.stash / status.price) * 100),
        );
        const progressWrap = el('div', { className: 'wishlist-progress' });
        const bar = el('div', { className: 'wishlist-progress__bar' });
        bar.style.width = `${String(pct)}%`;
        progressWrap.appendChild(bar);
        body.appendChild(progressWrap);
        const info = el('p', {
          className: 'wishlist-card__countdown',
          text: `${formatCurrency(status.stash)} / ${formatCurrency(status.price)} saved (${String(pct)}%)`,
        });
        body.appendChild(info);
      } else if (status.kind === 'unlocked') {
        body.appendChild(
          el('p', {
            className: 'wishlist-card__unlocked-badge',
            text: 'Unlocked',
          }),
        );
      } else if (status.kind === 'no-price') {
        body.appendChild(
          el('p', {
            className: 'wishlist-card__countdown',
            text: formatCountdown(w.reminderDate),
          }),
        );
      }

      const actions = el('div', { className: 'wishlist-card__actions' });

      const canBuy =
        status.kind === 'unlocked' ||
        (status.kind === 'no-price' && w.reminderDate <= Date.now());

      if (canBuy) {
        const bought = el('button', { text: 'Bought it' });
        bought.type = 'button';
        bought.className = 'button button--small';
        bought.addEventListener('click', async () => {
          bought.disabled = true;
          if (w.priceCents && w.priceCents > 0) {
            const expense: Expense = {
              id: randomId(),
              date: getToday(),
              amount: w.priceCents,
              description: `Wishlist: ${w.title}`,
              createdAt: Date.now(),
            };
            await addExpense(expense);
          }
          await deleteWishlistItem(w.id);
          await renderList();
        });
        actions.appendChild(bought);
      }

      const pauseBtn = el('button', { text: 'Pause goal' });
      pauseBtn.type = 'button';
      pauseBtn.className = 'button button--small button--secondary';
      pauseBtn.addEventListener('click', async () => {
        await deleteWishlistItem(w.id);
        await renderList();
      });
      actions.appendChild(pauseBtn);

      body.appendChild(actions);
      card.appendChild(body);
      li.appendChild(card);
      ul.appendChild(li);
    }
    listWrap.appendChild(ul);
    listWrap.appendChild(toggleBtn);
    listWrap.appendChild(formWrap);
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    const ttl = title.value.trim();
    if (!ttl) {
      err.textContent = 'Enter a title.';
      err.hidden = false;
      return;
    }
    let url: string | undefined;
    const urlVal = urlInput.value.trim();
    if (urlVal) {
      try {
        const parsed = new URL(urlVal);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          err.textContent = 'URL must start with http:// or https://';
          err.hidden = false;
          return;
        }
        url = parsed.href;
      } catch {
        err.textContent = 'Enter a valid URL.';
        err.hidden = false;
        return;
      }
    }

    let priceCents: number | undefined;
    const priceVal = price.value.trim();
    if (priceVal) {
      priceCents = dollarsToCents(priceVal);
      if (!Number.isFinite(priceCents) || priceCents <= 0) {
        err.textContent = 'Price must be a positive number.';
        err.hidden = false;
        return;
      }
    }
    addBtn.disabled = true;
    try {
      let image: Blob | undefined;
      const f = photo.files?.[0];
      if (f) {
        image = await resizeImageFile(f);
      }
      const now = Date.now();
      const item: WishlistItem = {
        id: randomId(),
        title: ttl,
        url,
        image,
        priceCents,
        createdAt: now,
        reminderDate: now + WISHLIST_DELAY_MS,
        notified: false,
        purchased: false,
      };
      await addWishlistItem(item);
      title.value = '';
      urlInput.value = '';
      price.value = '';
      photo.value = '';
      formVisible = false;
      formWrap.classList.remove('wishlist-form-wrap--open');
      toggleBtn.textContent = '+ Add something new';
      await renderList();
    } catch (e) {
      console.error(e);
      err.textContent = 'Could not add item.';
      err.hidden = false;
    } finally {
      addBtn.disabled = false;
    }
  });

  await renderList();

  countdownId = window.setInterval(() => {
    void renderList();
  }, 60_000);
}
