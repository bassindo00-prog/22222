# SonicFrame

SonicFrame creates music-player MP4s entirely in the browser. Album covers, audio, decoded samples, video frames, the MP4 file, and downloads stay on the user's device. The Node server serves static files only; it has no media upload or render endpoint.

## Run locally

Install the pinned dependencies, build the static app, and start the local static server:

```sh
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:4173>. The app requires a secure browser context (localhost or HTTPS). Upload and preview work in more browsers than export; exporting requires WebCodecs H.264 and AAC encoders, Web Audio, module workers, and OffscreenCanvas. The app checks the selected output size and codec support before encoding and reports when a browser cannot produce the required MP4.

The `dist/` folder from `npm run build` is a static production build and can be hosted on Vercel or another static host. The build includes the self-hosted Mediabunny MP4 muxer and its license. No render API, serverless function, FFmpeg worker, or media upload is used.

## Local rendering

- Web Audio decodes the local MP3/WAV. Only sample blocks between the selected Start and End frames are passed to the AAC encoder.
- A module Web Worker draws each frame onto OffscreenCanvas and encodes the frame with WebCodecs H.264. Progress timestamps come from the output frame timeline; the player progress indicator does not use real-time playback.
- The Minimal Player keeps the existing iPhone-style layout. Spotify Carousel is a separate selectable theme with locally sampled cover colors, repeated/mirrored versions of the current cover, a floating transport bar, and timestamp-driven motion. It uses SonicFrame branding rather than a third-party logo.
- iPhone Model uses a local 9:16 architectural background, a perspective-mapped player screen and cover, and a separate optional foreground photo layer. Users can replace the cover and foreground photo independently, then adjust the foreground photo position and size. Ordinary photos retain their rectangular backgrounds; transparent PNG/WebP images can be used as cut-outs. The same renderer and normalized screen corner coordinates are used by preview and local export. Its portrait ratio remains locked to preserve the composition.
- Mediabunny muxes encoded H.264 and AAC samples into a regular MP4. The result is held as a local Blob for video preview and download.
- The optional visualizer uses the audio envelope and frame timestamp. It does not require live playback.
- The selected H.264 bitrate can be set to Fast, Balanced, or High; the encoder configuration requests hardware acceleration when the browser reports that preference as supported, otherwise it falls back to the browser's default or software path. WebCodecs does not report whether a specific encode actually ran on the GPU.
- Cancel stops the worker, closes the output, releases decoded audio and revokes any previous output URL. Closing the page terminates the worker.

## Limits and compatibility

- MP3/WAV audio up to 60 MB and 10 minutes; JPG, JPEG, PNG, and WebP covers up to 20 MB; optional foreground JPG/PNG/WebP/AVIF/GIF up to 20 MB.
- 720p and 1080p output at 30 FPS, in 9:16, 1:1, or 16:9 ratios.
- Rendering decodes the selected source audio in memory. Five minutes of stereo float audio at 48 kHz takes about 115 MB, before the browser's decoder and encoded output allocations. Long clips or High quality may need substantial additional memory; use 720p/Fast or shorter selections on memory-limited devices.
- WebCodecs codec availability and speed depend on browser, operating system, and hardware. The browser may use software encoding even when hardware acceleration is preferred. The app displays the measured local render time after each successful export; it does not guarantee a fixed render speed.
- Browser export never silently changes an MP4 to WebM. If the browser cannot encode H.264/AAC, the app stops with a compatibility message.

## Build and tests

```sh
npm run build
npm test
```

The tests check static delivery, worker and muxer assets, and that the former media upload/render routes are not available.
