import {
  getExpensesForMonth,
  getSettings,
  getAllWishlist,
  deleteExpense,
  updateWishlistItem,
} from '../db.ts';
import {
  computeRemainingEnvelope,
  formatCurrency,
  getDayOfMonth,
  getDaysInMonth,
  getToday,
  getYearMonthFromDate,
  STORAGE_LAST_EXPORT,
} from '../utils.ts';
import { navigate } from '../router.ts';
import { categoryIconFor } from '../categories.ts';

export function cleanup(): void {
  /* no timers/listeners yet */
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

function isIOSStandalonePWA(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    // @ts-expect-error standalone is iOS-specific
    navigator.standalone === true
  );
}

function shouldShowBackupNudge(): boolean {
  if (!isIOSStandalonePWA()) return false;
  const raw = localStorage.getItem(STORAGE_LAST_EXPORT);
  const last = raw ? Number(raw) : 0;
  if (!last || !Number.isFinite(last)) return true;
  const week = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - last > week;
}

function countUp(
  element: HTMLElement,
  targetCents: number,
  durationMs: number,
  formatter: (cents: number) => string,
): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = formatter(targetCents);
    return;
  }
  const start = performance.now();
  const update = (now: number): void => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / durationMs, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    const current = Math.round(targetCents * eased);
    element.textContent = formatter(current);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

export async function render(container: HTMLElement): Promise<void> {
  const today = getToday();
  const yearMonth = getYearMonthFromDate(today);
  const settings = await getSettings();
  const expenses = await getExpensesForMonth(yearMonth);
  const wishlist = await getAllWishlist();

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

  if (shouldShowBackupNudge()) {
    const banner = el('div', { className: 'banner banner--ios' });
    const p = el('p');
    p.textContent =
      'iOS can clear app storage. Back up your data to be safe.';
    const btn = el('button', { text: 'Export JSON' });
    btn.type = 'button';
    btn.className = 'button button--secondary button--small';
    btn.addEventListener('click', () => {
      navigate('/settings');
    });
    banner.appendChild(p);
    banner.appendChild(btn);
    container.appendChild(banner);
  }

  const remaining =
    settings && settings.monthlyBudget > 0
      ? computeRemainingEnvelope(
          settings.monthlyBudget,
          yearMonth,
          today,
          totalSpent,
        )
      : 0;

  const dueWishlist = wishlist.filter((w) => {
    if (w.reminderDate > Date.now() || w.notified) return false;
    if (w.priceCents && w.priceCents > 0) return remaining >= w.priceCents;
    return true;
  });
  if (dueWishlist.length > 0) {
    const wBanner = el('div', { className: 'banner banner--wishlist' });
    const msg = el('p');
    msg.textContent =
      dueWishlist.length === 1
        ? 'A wishlist item is unlocked!'
        : `${String(dueWishlist.length)} wishlist items are unlocked!`;
    const go = el('button', { text: 'Review wishlist' });
    go.type = 'button';
    go.className = 'button button--small';
    go.addEventListener('click', async () => {
      for (const w of dueWishlist) {
        await updateWishlistItem({ ...w, notified: true });
      }
      navigate('/wishlist');
    });
    wBanner.appendChild(msg);
    wBanner.appendChild(go);
    container.appendChild(wBanner);
  }

  if (!settings || settings.monthlyBudget <= 0) {
    const wrap = el('section', { className: 'empty-state' });
    const h = el('h1', { text: 'How much can you spend this month?' });
    const p = el('p', {
      text: 'Set a monthly budget in Settings to see your daily envelope.',
    });
    const btn = el('button', { text: 'Set budget' });
    btn.type = 'button';
    btn.className = 'button button--primary button--full';
    btn.addEventListener('click', () => navigate('/settings'));
    wrap.appendChild(h);
    wrap.appendChild(p);
    wrap.appendChild(btn);
    container.appendChild(wrap);
    return;
  }

  const balance = el('div', { className: 'balance' });
  const label = el('p', {
    className: 'balance__label',
    text: 'Remaining this month',
  });
  const value = el('p', { className: 'balance__value' });
  if (remaining < 0) {
    value.classList.add('balance__value--negative');
  }
  balance.appendChild(label);
  balance.appendChild(value);
  container.appendChild(balance);

  countUp(value, remaining, 600, formatCurrency);

  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const dim = getDaysInMonth(y, m);
  const dailySlice = Math.round(settings.monthlyBudget / dim);
  const dom = getDayOfMonth(today);

  if (expenses.length === 0) {
    const sub = el('p', { className: 'subcopy' });
    sub.textContent =
      dom === 1
        ? `Fresh month! Daily allowance is about ${formatCurrency(dailySlice)}.`
        : "You haven't spent anything yet.";
    container.appendChild(sub);
  }

  if (expenses.length === 0) {
    const empty = el('p', {
      className: 'muted',
      text: 'Log your first expense to see how your budget tracks day by day.',
    });
    empty.style.marginTop = 'var(--space-48)';
    container.appendChild(empty);
  } else {
    const sorted = [...expenses].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt - a.createdAt;
    });

    const ul = el('ul', { className: 'expense-list' });
    for (const ex of sorted) {
      const li = el('li', { className: 'expense-list__item' });
      const row = el('div', { className: 'expense-list__row' });
      const left = el('div');
      const amt = el('span', {
        className: 'expense-list__amount',
        text: formatCurrency(ex.amount),
      });
      const descRow = el('span', { className: 'expense-list__desc' });
      const catIcon = categoryIconFor(ex.description);
      if (catIcon) {
        const iconEl = el('span', { className: 'expense-list__cat-icon' });
        iconEl.innerHTML = catIcon;
        descRow.appendChild(iconEl);
      }
      descRow.appendChild(document.createTextNode(ex.description || '\u2014'));
      const date = el('span', {
        className: 'expense-list__date',
        text: ex.date,
      });
      left.appendChild(amt);
      left.appendChild(descRow);
      left.appendChild(date);

      const actions = el('div', { className: 'expense-list__actions' });
      const editBtn = el('button', { text: 'Edit' });
      editBtn.type = 'button';
      editBtn.className = 'button button--small button--secondary';
      editBtn.addEventListener('click', () => {
        navigate(`/log?id=${encodeURIComponent(ex.id)}`);
      });
      const delBtn = el('button', { text: 'Delete' });
      delBtn.type = 'button';
      delBtn.className = 'button button--small button--danger';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this expense?')) return;
        await deleteExpense(ex.id);
        container.replaceChildren();
        await render(container);
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      row.appendChild(left);
      row.appendChild(actions);
      li.appendChild(row);
      ul.appendChild(li);
    }
    container.appendChild(ul);
  }

  const fab = el('button');
  fab.type = 'button';
  fab.className = 'fab';
  fab.textContent = '+';
  fab.setAttribute('aria-label', 'Log expense');
  fab.addEventListener('click', () => navigate('/log'));
  container.appendChild(fab);
}
