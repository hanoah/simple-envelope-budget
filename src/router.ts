/**
 * Hash router: #/ #/log #/wishlist #/settings #/log?id=
 *
 *   hashchange --> parse --> cleanup(prev) --> clear container --> render(next)
 */
import { render as renderDashboard, cleanup as cleanupDashboard } from './views/dashboard.ts';
import { render as renderLogExpense, cleanup as cleanupLogExpense } from './views/log-expense.ts';
import { render as renderWishlist, cleanup as cleanupWishlist } from './views/wishlist.ts';
import { render as renderSettings, cleanup as cleanupSettings } from './views/settings.ts';

export type RouteName = 'home' | 'log' | 'wishlist' | 'settings';

export interface ParsedRoute {
  name: RouteName;
  expenseId?: string;
  prefillDesc?: string;
}

const viewRootId = 'view-root';

export function parseHash(): ParsedRoute {
  const raw = location.hash.slice(1) || '/';
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const params = new URLSearchParams(queryPart ?? '');
  const id = params.get('id') ?? undefined;

  if (path === '/log' || path === '/log/') {
    return { name: 'log', expenseId: id, prefillDesc: params.get('desc') ?? undefined };
  }
  if (path === '/wishlist' || path === '/wishlist/') {
    return { name: 'wishlist' };
  }
  if (path === '/settings' || path === '/settings/') {
    return { name: 'settings' };
  }
  return { name: 'home' };
}

export function navigate(path: string): void {
  const p = path.startsWith('#') ? path : `#${path}`;
  if (location.hash === p) {
    void route();
    return;
  }
  location.hash = p;
}

let currentCleanup: (() => void) | null = null;

export async function route(): Promise<void> {
  const root = document.getElementById(viewRootId);
  if (!root) {
    console.error('Missing #view-root');
    return;
  }
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  root.replaceChildren();

  const r = parseHash();
  const run = async (): Promise<void> => {
    switch (r.name) {
      case 'home':
        currentCleanup = cleanupDashboard;
        await renderDashboard(root);
        break;
      case 'log':
        currentCleanup = cleanupLogExpense;
        await renderLogExpense(root, r.expenseId, r.prefillDesc);
        break;
      case 'wishlist':
        currentCleanup = cleanupWishlist;
        await renderWishlist(root);
        break;
      case 'settings':
        currentCleanup = cleanupSettings;
        await renderSettings(root);
        break;
    }
  };

  try {
    await run();
  } catch (e) {
    console.error(e);
    const err = document.createElement('p');
    err.className = 'error-banner';
    err.textContent = 'Something went wrong. Try again.';
    root.appendChild(err);
  }

  updateTabHighlight();
}

function updateTabHighlight(): void {
  const r = parseHash();
  document.querySelectorAll<HTMLAnchorElement>('[data-tab]').forEach((a) => {
    const tab = a.dataset.tab;
    const active =
      (r.name === 'home' && tab === 'home') ||
      (r.name === 'log' && tab === 'log') ||
      (r.name === 'wishlist' && tab === 'wishlist') ||
      (r.name === 'settings' && tab === 'settings');
    a.setAttribute('aria-current', active ? 'page' : 'false');
    a.classList.toggle('tab--active', active);
  });
}

export function initRouter(): void {
  window.addEventListener('hashchange', () => {
    void route();
  });
  void route();
}
