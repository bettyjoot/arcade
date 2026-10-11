/*
 * Site settings. Paste your Firebase web app config here (Firebase console >
 * Project settings > Your apps > Web app). These values are not secrets: they
 * identify the project, and the Firestore rules in firestore.rules are what
 * protect the data. Leave apiKey empty to run in demo mode, where scores are
 * kept only in the visitor's own browser.
 */
window.JB_CONFIG = {
  firebase: {
    apiKey: "AIzaSyASVkQpx101Z4wUqxW0kvOb55Zcte7SHyM",
    authDomain: "bettyjootarcade.firebaseapp.com",
    projectId: "bettyjootarcade",
    appId: "1:414808094272:web:4379a000aea69b0a3bd1a5"
  },
  /* Optional bot check (Firebase App Check). Leave empty to run without it.
     Use a reCAPTCHA Enterprise key: a score-based Website key created in the
     Google Cloud console and registered in Firebase App Check. */
  appCheckSiteKey: "",
  appCheckProvider: "enterprise",
  /* Your own music, one entry per game, looped without a gap during play.
     Empty means no music for that game.
     - A WAV cut to an exact loop can be given as just its file name.
     - An MP3 needs its exact music length (loop, seconds) and the moment its
       first note sounds in the original recording (lead, seconds), because MP3
       files carry a sliver of silence that would otherwise be heard as a hiccup.
     - `volume` (0 to 1) turns one track down relative to the other. */
  music: {
    jetty1: { src: "audio/jetty-boot.mp3", loop: 37.333333, lead: 0.013333, volume: 0.75 },
    jetty2: { src: "audio/sole-survivor.mp3", loop: 68.108104, lead: 0 }
  },
  musicVolume: 0.5,
  /* Pinned Firebase SDK version loaded from gstatic. */
  sdk: "10.12.2"
};
