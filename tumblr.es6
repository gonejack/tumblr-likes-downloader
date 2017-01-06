const path = require('path');
const fs = require('fs');
const got = require('got');
const tumblrJS = require('tumblr.js');
const queue = require('./queue.es6');

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

class Tumblr {
    constructor(credentials, options) {
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

        this.dir = options.dir;
        this.max = options.max;
        this.step = options.step;
        this.downer = new queue(this.got.bind(this), options.win);

        this.post = null;
        this.parsed = 0;
        this.downded = 0;
        this.skipped = 0;

        this.setupTxt();

        return this.init();
    }
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
    setupTxt() {
        let date = new Date();
        let file = ['./', date.getFullYear(), date.getMonth(), '.txt'].join('');

        this.fd = fs.openSync(file, 'a+');
        this.record = fs.readFileSync(this.fd);
    }
    getName(url) {
        let {blog_name: blog, id: postId} = this.post;

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
    got({url, name}) {
        let dest = this.getDest(name);
        let temp = dest + '.down';

        return new Promise((res, rej) => {
            let stream = got.stream(url.replace(/^https/, 'http'));

            stream.on('error', err => {
                stream.unpipe();

                console.log(`Error: ${url}`);

                rej(err);
            });

            stream.on('end', () => {
                fs.renameSync(temp, dest);

                this.downded += 1;
                this.writeURLRec(url);

                console.log(`Downloaded: ${url}`);

                res(url);
            });

            stream.pipe(fs.createWriteStream(temp));
        });
    }
    parsePhotos(photos) {
        let dls = [];

        for (let {original_size: {url}} of photos) {
            dls.push({url, name: this.getName(url)});
        }

        return dls;
    }
    parseVideo(url) {
        return {url, name: this.getName(url)};
    }
    parse(posts) {
        this.parsed += posts.length;

        let arr = [];

        for (let post of posts) {
            let {photos, video_url} = this.post = post;

            let dls = [];
            switch (true) {
                case !!photos:
                    dls = this.parsePhotos(photos);
                break;
                case !!video_url:
                    dls = this.parseVideo(video_url);
                break;
            }

            arr = arr.concat(dls);
        }

        arr = arr.filter(dl => {
            if (this.checkURLRec(dl.url)) {
                this.skipped += 1;
            }
            else {
                return true;
            }
        });

        return arr;
    }
    downSave(dls) {
        return this.downer.execAll(dls);
    }
    *downLikes() {
        fs.existsSync(this.dir) || fs.mkdirSync(this.dir);

        let offset = 0, page = 1, max = this.max, step = this.step;

        while (offset < max) {
            step = Math.min(max - offset, this.step);

            try {
                console.log(`Fetching Page ${page}`);

                let data = yield this.client.userLikes({offset: offset, limit: step});

                let {liked_posts: posts, liked_count: total} = data;

                yield this.downSave(this.parse(posts));

                max = Math.min(total, this.max);
            }
            catch (e) {
                console.error(e);
            }
            finally {
                if (this.skipped) {
                    console.log(`Skipped: ${this.skipped}`);

                    this.skipped = 0;
                }

                console.log(`Fetched Page ${page}\n`);
            }

            offset += step;
            page += 1;
        }

        console.log(`Post parsed: ${this.parsed}`);
        console.log(`Things downed: ${this.downded}`);
    }
}

module.exports = Tumblr;