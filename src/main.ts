import { createApp } from "vue";
import { Quasar } from "quasar";
import quasarLang from "quasar/lang/zh-CN";
import quasarIconSet from "quasar/icon-set/mdi-v7";
import "./styles/color"

// Import icon libraries
import "@quasar/extras/mdi-v7/mdi-v7.css";

// A few examples for animations from Animate.css:
// import @quasar/extras/animate/fadeIn.css
// import @quasar/extras/animate/fadeOut.css

import "quasar/src/css/index.sass";

import { createPinia } from "pinia";

import "./styles/style.css";

import router from "./router/router";

import App from "./App.vue";

const app = createApp(App);

app.use(createPinia())
app.use(router)

app.use(Quasar, {
  plugins: {}, // import Quasar plugins and add here
  lang: quasarLang,
  iconSet: quasarIconSet,
});

app.mount("#app");
