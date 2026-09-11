import type { CapacitorConfig } from '@capacitor/cli'

/* L'app iOS è lo stesso sito impacchettato in una WKWebView: il
   codice in src/ non cambia. Qui solo identità e comportamento
   nativo. */
const config: CapacitorConfig = {
  appId: 'it.lugaresi.mysapienza',
  appName: 'MySapienza',
  webDir: 'dist',
  backgroundColor: '#060607',
  ios: {
    // Il contenuto passa sotto la barra di stato, come sul sito:
    // il layout gestisce da sé le aree sicure.
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#060607',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 0,
      backgroundColor: '#060607',
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#83082A',
    },
  },
}

export default config
