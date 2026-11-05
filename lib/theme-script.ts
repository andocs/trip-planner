export const THEME_KEY = "tp-theme";

/** Runs before first paint (inlined in <head>) so the page never flashes the wrong theme. */
export const themeInitScript = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);var m=document.querySelector('meta[name="theme-color"]');if(m&&d)m.setAttribute("content","#121826");}catch(e){}})();`;
