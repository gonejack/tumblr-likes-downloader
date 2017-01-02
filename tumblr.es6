const path = require('path');
const fs = require('fs');
const got = require('got');
const tumblrJS = require('tumblr.js');

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
    constructor(credentials, options) {
        super();

        options = Object.assign({
            saveDir: './likes',
            fetchNum: 250,
            fetchStep: 20,
            downLimit: 5,
        }, options || {});

        this.client = tumblrJS.createClient({
            credentials: credentials,

            returnPromises: true,
        });

        this.post = null;
        this.saveDir = options.saveDir;
        this.fetchNum = options.fetchNum;
        this.fetchStep = options.fetchStep;
        this.queue = [];
        this.win = options.downLimit;
        this.cur = 0; // current running download
        this.setupTxt();

        this.fetched = 0;
        this.downded = 0;

        return this.init();
    }
    setupTxt() {
        let date = new Date();
        let file = ['./', date.getFullYear(), date.getMonth(), '.txt'].join('');

        this.fd = fs.openSync(file, 'a+');
        this.record = fs.readFileSync(this.fd);
    }
    getName(url) {
        let blog = this.post.blog_name;
        let postId = this.post.id;

        return [blog, postId, path.basename(url)].join('-');
    }
    getDest(name) {
        return this.saveDir + '/' + name;
    }
    checkURLRec(url) {
        return this.record.includes(url);
    }
    writeURLRec(url) {
        return fs.appendFileSync(this.fd, url + '\n');
    }
    parsePhotos(photos) {
        let dls = [];

        for (let photo of photos) {
            let url = photo.original_size.url;

            dls.push({url: url, name: this.getName(url)});
        }

        return dls;
    }
    parseVideo(url) {
        return {url: url, name: this.getName(url)};
    }
    got(url, dest) {
        this.cur += 1;

        let stream = got.stream(url.replace(/^https/, 'http'));
        let temp = dest + '.down';

        stream.on('error', err => {
            stream.unpipe();

            console.log(err);
        });

        stream.on('end', () => {
            fs.renameSync(temp, dest);

            this.downded += 1;
            this.writeURLRec(url);

            this.cur -= 1;
            this.runWin();
        });

        stream.pipe(fs.createWriteStream(temp));
    }
    fetch(dl) {
        if (this.checkURLRec(dl.url)) {
            console.log(`Skipped: ${dl.url}`);
        }
        else {
            this.got(dl.url, this.getDest(dl.name));

            console.log(`Download: ${dl.url}`);
        }
    }
    runWin() {
        if (this.queue.length) {
            while (this.cur < this.win && this.queue.length) {
                this.fetch(this.queue.shift());
            }

            this.running = !!this.cur;
        }

        else {
            this.running = false;
        }
    }
    enQueue(dls) {
        this.queue = this.queue.concat(dls).filter(Boolean);
    }
    runQueue() {
        let promise = (ok, err) => {
            this.runWin();

            let check = setInterval(() => {
                if (!this.running) {
                    clearInterval(check);

                    ok();
                }
            }, 500);
        };

        return new Promise(promise);
    }
    *proc(posts) {
        this.fetched += posts.length;

        for (let post of posts) {
            this.post = post;

            let dls;
            switch (true) {
                case !!post.photos:
                    dls = this.parsePhotos(post.photos);
                break;
                case !!post.video_url:
                    dls = this.parseVideo(post.video_url);
                break;
            }

            this.enQueue(dls);
        }

        return this.runQueue();
    }
    *downLikes() {
        fs.existsSync(this.saveDir) || fs.mkdirSync(this.saveDir);

        let offset = 0, page = 1, max = this.fetchNum, step = this.fetchStep;

        while (offset < max) {
            step = Math.min(max - offset, this.fetchStep);

            console.log(`Fetching Page ${page}`);
            try {
                let data = yield this.client.userLikes({offset: offset, limit: step});

                yield this.proc(data.liked_posts);

                max = Math.min(data.liked_count, this.fetchNum);
            }
            catch (e) {
                console.error(e);
            }
            console.log(`Fetched Page ${page}`);

            offset += step;
            page += 1;
        }

        console.log(`Post fetched: ${this.fetched}`);
        console.log(`Things downed: ${this.downded}`);
    }
}

module.exports = Tumblr;