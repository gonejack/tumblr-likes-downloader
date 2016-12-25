const path = require('path');
const fs = require('fs');
const http = require('http');
const Downloader = require('mt-files-downloader');

function async(gen) {
    return function () {
        let it = gen.apply(this, arguments);

        function dispatch(val) {
            if (val && val.constructor === (function*(){})().constructor) {
                return handler(val.next(), val);
            }
            else {
                return Promise.resolve(val);
            }
        }

        function handler(res, i) {
            if (res.done) {
                return dispatch(res.value);
            }
            else {
                let onNext = function (res) {
                    return handler(i.next(res), i);
                };

                let onError = function (err) {
                    return handler(i.throw(err), i);
                };

                return dispatch(res.value).then(onNext, onError);
            }
        }

        try {
            return handler(it.next(), it);
        }
        catch (ex) {
            return Promise.reject(ex);
        }
    }
}

class Base {
    init() {
        return new Proxy(this, {
            get(target, name) {
                let member = target[name];
                if (typeof member === 'function') {
                    let method = target[name].bind(target);

                    return async(method);
                }
                else {
                    return member;
                }
            }
        });
    }
}

class Tumblr extends Base {
    constructor(credentials, path) {
        super();

        let tumblr = require('tumblr.js');
        this.client = tumblr.createClient({
            credentials: credentials,

            returnPromises: true,
        });

        let date = new Date();
        this.txtfd = fs.openSync(['./', date.getFullYear(), date.getMonth(), '.txt'].join(''), 'a+');
        this.record = fs.readFileSync(this.txtfd);

        let dir = path || './likes/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir)
        }
        this.dir = dir;

        this.downloader = new Downloader();

        this.post = null;

        return this.init();
    }
    static logDL(dl) {
        let timer = setInterval(() => {
            switch (dl.status) {
                case 0:
                    console.log('Not Started '+ dl.url);
                    break;
                case 1:
                    let stats = dl.getStats();
                    let progress = 'Progress: '+ stats.total.completed +' %';
                    let speed = 'Speed: '+ Downloader.Formatters.speed(stats.present.speed);
                    let time = 'Time: '+ Downloader.Formatters.elapsedTime(stats.present.time);
                    let ETA = 'ETA: '+ Downloader.Formatters.remainingTime(stats.future.eta);

                    console.log(`Downloading: ${dl.url}`);
                    console.log(progress, speed, time, ETA);
                    break;
                case 2:
                    console.log('Error: '+ dl.url +' retrying...');
                    break;
                case 3:
                    console.log('Completed: '+ dl.url);
                    clearInterval(timer);
                    break;
                case -1:
                    console.log('Error: '+ dl.url +' error : '+ dl.error);
                    clearInterval(timer);
                    break;
                case -2:
                    console.log('Stopped: '+ dl.url);
                    break;
                case -3:
                    console.log('Destroyed: '+ dl.url);
                    clearInterval(timer);
                    break;
            }
        }, 2000);
    }
    genName(url) {
        let blog = this.post.blog_name;
        let postId = this.post.id;

        return [blog, postId, path.basename(url)].join('-');
    }
    downSave(url, dest) {
        let dl = this.downloader.download(url.replace(/^https/, 'http'), dest);

        return new Promise((resolve, reject) => {
            dl.on('start', resolve)
              .on('error', () => {dl.destroy(); reject()})
              .on('end', () => {fs.appendFileSync(this.txtfd, url + '\n')})
              .start();

            Tumblr.logDL(dl);
        });
    }
    *downPhotos(photos) {
        for (let photo of photos) {
            photo = photo.original_size;

            if (!this.record.includes(photo.url)) {
                let name = this.genName(photo.url);

                try {
                    yield this.downSave(photo.url, this.dir + '/' + name);

                    console.log(`Started: ${name}`);
                }
                catch (ex) {
                    console.log(ex);
                    console.log(`Failed: ${photo.url}`);
                }
            }
        }
    }
    *downVideo(url) {
        if (!this.record.includes(url)) {
            let name = this.genName(url);

            try {
                yield this.downSave(url, this.dir + '/' + name);

                console.log(`Started: ${name}`);
            }
            catch (ex) {
                console.log(`Failed: ${url}`);
            }
        }
    }
    *process(posts) {
        for (let post of posts) {
            this.post = post;

            switch (true) {
                case !!post.photos:
                    yield this.downPhotos(post.photos);
                break;

                case !!post.video_url:
                    yield this.downVideo(post.video_url);
                break;
            }
        }
    }
    *downLikes() {
        let pageMax = 10, page = 1, step = 20, count = 0;

        while (page <= pageMax) {
            try {
                console.log(`Fetch: Page ${page}`);

                let data = yield this.client.userLikes({
                    offset: (page - 1) * step,
                    limit: step
                });

                yield this.process(data.liked_posts);

                console.log(`Fetched: Page ${page}`);

                page += 1;
                count += data.liked_posts.length;
                pageMax = Math.min(Math.ceil(data.liked_count / step), pageMax);
            }
            catch (ex) {
                console.log(`Fetch Failed: Page ${page}`);
            }
        }

        console.log('Parsed: ', count);
    }
}

module.exports = Tumblr;