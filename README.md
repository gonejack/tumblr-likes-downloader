# tumblr-likes-downloader
Download liked posts with Node.js by fetching Tumblr API

Usage:
```
  const Tumblr = require('./tumblr.es6');

  // Get your credentials from tumblr API console.
  let credentials = {
      consumer_key: <YOUR KEY>,
     consumer_secret: <YOUR SECRET>,
      token: <YOUR TOKEN>,
      token_secret: <YOUR TOKEN SECRET>
  };

  new Tumblr(credentials).downLikes();
```
