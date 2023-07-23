import { defineConfig } from "vite";

import vue from "@vitejs/plugin-vue";
import vue_jsx from "@vitejs/plugin-vue-jsx";
import { quasar, transformAssetUrls } from "@quasar/vite-plugin";
import crossOriginIsolation from "vite-plugin-cross-origin-isolation";


import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue({ template: { transformAssetUrls } }),
    vue_jsx({
      mergeProps: true,

    }),
    quasar({
      sassVariables: "src/styles/quasar-variables.sass",
    }),
    crossOriginIsolation()
  ],
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
});
