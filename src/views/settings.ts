import {
  clearAllData,
  exportBackup,
  getSettings,
  importBackup,
  parseBackupJson,
  saveSettings,
} from '../db.ts';
import {
  dollarsToCents,
  IMPORT_MAX_BYTES,
  STORAGE_LAST_EXPORT,
} from '../utils.ts';
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

function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function render(container: HTMLElement): Promise<void> {
  const header = el('header', { className: 'screen-header' });
  header.appendChild(el('h1', { text: 'Settings' }));
  container.appendChild(header);

  const settings = await getSettings();
  const form = el('form', { className: 'form' });
  const budgetLabel = el('label', { text: 'Monthly budget (CAD)' });
  budgetLabel.htmlFor = 'budget';
  const budget = el('input');
  budget.id = 'budget';
  budget.type = 'text';
  budget.className = 'form-input';
  budget.inputMode = 'decimal';
  budget.required = true;
  budget.placeholder = '0.00';
  if (settings && settings.monthlyBudget > 0) {
    budget.value = (settings.monthlyBudget / 100).toFixed(2);
  }

  const budgetErr = el('p', { className: 'form-error' });
  budgetErr.hidden = true;

  const saveBudget = el('button', { text: 'Save budget' });
  saveBudget.type = 'submit';
  saveBudget.className = 'button button--primary button--full';

  form.appendChild(budgetLabel);
  form.appendChild(budget);
  form.appendChild(budgetErr);
  form.appendChild(saveBudget);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    budgetErr.hidden = true;
    const cents = dollarsToCents(budget.value.trim());
    if (!Number.isFinite(cents) || cents <= 0) {
      budgetErr.textContent = 'Enter a budget greater than zero.';
      budgetErr.hidden = false;
      return;
    }
    saveBudget.disabled = true;
    try {
      await saveSettings(cents);
    } catch (e) {
      console.error(e);
      budgetErr.textContent = 'Could not save.';
      budgetErr.hidden = false;
    } finally {
      saveBudget.disabled = false;
    }
  });

  container.appendChild(form);

  const backupSection = el('section', { className: 'settings-section' });
  backupSection.appendChild(el('h2', { text: 'Backup' }));

  const exportBtn = el('button', { text: 'Export JSON' });
  exportBtn.type = 'button';
  exportBtn.className = 'button button--secondary';
  const exportStatus = el('p', { className: 'muted' });
  exportStatus.textContent = '';

  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportStatus.textContent = 'Preparing...';
    try {
      const data = await exportBackup();
      const text = JSON.stringify(data, null, 2);
      downloadJson(
        `budget-backup-${new Date().toISOString().slice(0, 10)}.json`,
        text,
      );
      localStorage.setItem(STORAGE_LAST_EXPORT, String(Date.now()));
      exportStatus.textContent = 'Download started.';
    } catch (e) {
      console.error(e);
      exportStatus.textContent = 'Export failed.';
    } finally {
      exportBtn.disabled = false;
    }
  });

  const importLabel = el('label', {
    text: 'Import JSON (replaces all data)',
  });
  importLabel.htmlFor = 'importfile';
  const importInput = el('input');
  importInput.id = 'importfile';
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';

  const importErr = el('p', { className: 'form-error' });
  importErr.hidden = true;

  importInput.addEventListener('change', async () => {
    importErr.hidden = true;
    const file = importInput.files?.[0];
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      importErr.textContent = 'File is larger than 10MB.';
      importErr.hidden = false;
      importInput.value = '';
      return;
    }
    if (!confirm('Replace all data on this device with this backup?')) {
      importInput.value = '';
      return;
    }
    try {
      const text = await file.text();
      const payload = parseBackupJson(text);
      await importBackup(payload);
      localStorage.setItem(STORAGE_LAST_EXPORT, String(Date.now()));
      navigate('/');
    } catch (e) {
      console.error(e);
      importErr.textContent =
        e instanceof Error ? e.message : 'Import failed.';
      importErr.className = 'form-error';
      importErr.hidden = false;
    }
    importInput.value = '';
  });

  backupSection.appendChild(exportBtn);
  backupSection.appendChild(exportStatus);
  backupSection.appendChild(importLabel);
  backupSection.appendChild(importInput);
  backupSection.appendChild(importErr);
  container.appendChild(backupSection);

  const danger = el('section', {
    className: 'settings-section settings-section--danger',
  });
  danger.appendChild(el('h2', { text: 'Danger zone' }));
  const clearBtn = el('button', { text: 'Clear all local data' });
  clearBtn.type = 'button';
  clearBtn.className = 'button button--danger';
  clearBtn.addEventListener('click', async () => {
    if (
      !confirm(
        'Delete all expenses, wishlist, and budget from this device? This cannot be undone.',
      )
    ) {
      return;
    }
    clearBtn.disabled = true;
    try {
      await clearAllData();
      navigate('/');
    } catch (e) {
      console.error(e);
      alert('Could not clear data.');
    } finally {
      clearBtn.disabled = false;
    }
  });
  danger.appendChild(clearBtn);
  container.appendChild(danger);
}
