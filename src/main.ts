import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { subscribeDataChanged } from './db.ts';
import { initRouter, route } from './router.ts';

try {
  registerSW({ immediate: true });
} catch (e) {
  console.warn('Service worker registration skipped', e);
}

subscribeDataChanged(() => {
  void route();
});

initRouter();
