const path = require('path');
const fs = require('fs');
const got = require('got');
const tumblrJS = require('tumblr.js');

function async(gen) {
    return function () {
        let it = gen.apply(this, arguments);

        function dispatch(ret) {
            // generator iterator
            if (ret && ret.constructor === (function*(){})().constructor) {
                return handler(ret.next(), ret);
            }
            // normal value
            else {
                return Promise.resolve(ret);
            }
        }

        function handler(res, it) {
            if (res.done) {
                return dispatch(res.value);
            }
            else {
                let ok = function (ret) {
                    return handler(it.next(ret), it);
                };

                let err = function (err) {
                    return handler(it.throw(err), it);
                };

                return dispatch(res.value).then(ok, err);
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
            dir: './likes',
            max: 250,
            step: 20,
            win: 5,
        }, options || {});

        this.client = tumblrJS.createClient({
            credentials: credentials,

            returnPromises: true,
        });

        this.post = null;

        this.dir = options.dir;
        this.max = options.max;
        this.step = options.step;
        this.win = options.win;

        this.queue = [];
        this.cur = 0; // current running download

        this.setupTxt();

        this.fetched = 0;
        this.downded = 0;
        this.skipped = 0;

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
        return this.dir + '/' + name;
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

            console.log(`Error: ${url}`);
            console.error(err);

            this.cur -= 1;
            this.runWin();
        });

        stream.on('end', () => {
            fs.renameSync(temp, dest);

            this.downded += 1;
            this.writeURLRec(url);

            console.log(`Downloaded: ${url}`);

            this.cur -= 1;
            this.runWin();
        });

        stream.pipe(fs.createWriteStream(temp));
    }
    fetch(dl) {
        if (this.checkURLRec(dl.url)) {
            this.skipped += 1;
            // console.log(`Skipped: ${dl.url}`);
        }
        else {
            this.got(dl.url, this.getDest(dl.name));
        }
    }
    runWin() {
        if (this.queue.length) {
            while (this.cur < this.win && this.queue.length) {
                this.fetch(this.queue.shift());
            }
        }

        this.running = !!this.cur;
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
        fs.existsSync(this.dir) || fs.mkdirSync(this.dir);

        let offset = 0, page = 1, max = this.max, step = this.step;

        while (offset < max) {
            step = Math.min(max - offset, this.step);

            console.log(`Fetching Page ${page}`);
            try {
                let data = yield this.client.userLikes({offset: offset, limit: step});

                yield this.proc(data.liked_posts);

                max = Math.min(data.liked_count, this.max);

                if (this.skipped) {
                    console.log(`Skipped: ${this.skipped}`);

                    this.skipped = 0;
                }
            }
            catch (e) {
                console.error(e);
            }
            console.log(`Fetched Page ${page}\n`);

            offset += step;
            page += 1;
        }

        console.log(`Post fetched: ${this.fetched}`);
        console.log(`Things downed: ${this.downded}`);
    }
}

module.exports = Tumblr;