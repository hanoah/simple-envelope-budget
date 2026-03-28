import { addExpense, getExpense, updateExpense } from '../db.ts';
import type { Expense } from '../types.ts';
import { dollarsToCents, getToday, getYearMonthFromDate } from '../utils.ts';
import { navigate } from '../router.ts';

export function cleanup(): void {
  /* no-op */
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

function monthBounds(ym: string): { min: string; max: string } {
  const [y, m] = ym.split('-').map(Number);
  const year = y ?? new Date().getFullYear();
  const month = m ?? 1;
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    min: `${year}-${mm}-01`,
    max: `${year}-${mm}-${String(last).padStart(2, '0')}`,
  };
}

export async function render(
  container: HTMLElement,
  expenseId?: string,
): Promise<void> {
  const today = getToday();
  const yearMonth = getYearMonthFromDate(today);
  const { min, max } = monthBounds(yearMonth);

  const existing = expenseId ? await getExpense(expenseId) : undefined;

  if (expenseId && !existing) {
    const warn = el('p', {
      className: 'form-error',
      text: 'Expense not found.',
    });
    const back = el('button', { text: 'Back' });
    back.type = 'button';
    back.className = 'button button--primary button--full';
    back.addEventListener('click', () => navigate('/'));
    container.appendChild(warn);
    container.appendChild(back);
    return;
  }

  if (existing && !existing.date.startsWith(yearMonth)) {
    const warn = el('p', {
      className: 'form-error',
      text: 'This expense is not in the current month. Editing is only available for this month.',
    });
    const back = el('button', { text: 'Back' });
    back.type = 'button';
    back.className = 'button button--primary button--full';
    back.addEventListener('click', () => navigate('/'));
    container.appendChild(warn);
    container.appendChild(back);
    return;
  }

  const form = el('form', { className: 'form' });

  const amountHero = el('div', { className: 'amount-hero' });
  const amount = el('input');
  amount.className = 'amount-hero__input';
  amount.type = 'text';
  amount.inputMode = 'decimal';
  amount.autocomplete = 'off';
  amount.required = true;
  amount.placeholder = '$0.00';
  amount.setAttribute('aria-label', 'Amount (CAD)');
  if (existing) {
    amount.value = (existing.amount / 100).toFixed(2);
  }
  const amountLabel = el('p', {
    className: 'amount-hero__label',
    text: 'Amount (CAD)',
  });
  amountHero.appendChild(amount);
  amountHero.appendChild(amountLabel);
  form.appendChild(amountHero);

  const descLabel = el('label', { text: 'Description' });
  descLabel.htmlFor = 'desc';
  const desc = el('input');
  desc.id = 'desc';
  desc.type = 'text';
  desc.className = 'form-input';
  desc.autocomplete = 'off';
  desc.maxLength = 200;
  desc.placeholder = 'Coffee, groceries, ...';
  if (existing) {
    desc.value = existing.description;
  }

  const dateLabel = el('label', { text: 'Date' });
  dateLabel.htmlFor = 'date';
  const date = el('input');
  date.id = 'date';
  date.type = 'date';
  date.className = 'form-input';
  date.required = true;
  date.min = min;
  date.max = max;
  date.value = existing?.date ?? today;

  const err = el('p', { className: 'form-error' });
  err.hidden = true;

  const actions = el('div', { className: 'form-actions' });
  const cancel = el('button', { text: 'Cancel' });
  cancel.type = 'button';
  cancel.className = 'button button--secondary';
  cancel.addEventListener('click', () => navigate('/'));
  const submit = el('button', {
    text: expenseId ? 'Save' : 'Add expense',
  });
  submit.type = 'submit';
  submit.className = 'button button--primary';
  actions.appendChild(cancel);
  actions.appendChild(submit);

  form.appendChild(descLabel);
  form.appendChild(desc);
  form.appendChild(dateLabel);
  form.appendChild(date);
  form.appendChild(err);
  form.appendChild(actions);
  container.appendChild(form);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    const cents = dollarsToCents(amount.value.trim());
    if (!Number.isFinite(cents) || cents <= 0) {
      err.textContent = 'Enter a positive amount.';
      err.hidden = false;
      return;
    }
    const dVal = date.value;
    if (!dVal.startsWith(yearMonth)) {
      err.textContent = 'Date must be in the current month.';
      err.hidden = false;
      return;
    }

    submit.disabled = true;
    try {
      const description = desc.value.trim();
      if (existing) {
        const next: Expense = {
          ...existing,
          date: dVal,
          amount: cents,
          description,
        };
        await updateExpense(next);
      } else {
        const row: Expense = {
          id: randomId(),
          date: dVal,
          amount: cents,
          description,
          createdAt: Date.now(),
        };
        await addExpense(row);
      }
      navigate('/');
    } catch (e) {
      console.error(e);
      err.textContent = 'Could not save. Try again.';
      err.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
}
