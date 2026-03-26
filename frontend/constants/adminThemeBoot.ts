import { ADMIN_SETTINGS_STORAGE_KEY } from './adminSettings'

/** Выполняется в head до первой отрисовки: dark-mode и data-accent из localStorage (без FOUC). */
export const ADMIN_THEME_BOOT_INLINE_SCRIPT = `(function(){try{var k='${ADMIN_SETTINGS_STORAGE_KEY}';var raw=localStorage.getItem(k);if(!raw)return;var p=JSON.parse(raw);var r=document.documentElement;var tm=String(p.themeMode||'light').toLowerCase();var d=false;if(tm==='dark')d=true;else if(tm==='system'&&window.matchMedia)d=window.matchMedia('(prefers-color-scheme: dark)').matches;r.classList.toggle('dark-mode',d);var a=String(p.accent||'emerald').toLowerCase();r.setAttribute('data-accent',a);}catch(e){}})();`
