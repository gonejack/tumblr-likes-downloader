const path = require('path');
const fs = require('fs');
const got = require('got');
const execSync = require('child_process').execSync;
const tumblrJS = require('tumblr.js');
const queue = require('./queue.es6');
const async = require('./async.es6');
const log = console.log;

class Tumblr {
    constructor(credentials, options = {}) {
        this.client = tumblrJS.createClient({
            credentials: credentials,

            returnPromises: true,
        });

        let {
            dir = './likes',
            max = 250,
            step = 20,
            win = 5,
        } = options;

        this.dir = dir;
        this.max = max;
        this.step = step;
        this.downer = new queue(this.got.bind(this), win);

        this.post = null;
        this.parsed = 0;
        this.downded = 0;
        this.skipped = 0;

        this.setupTxt();

        return this.async();
    }
    async() {
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
        let txtName = () => ['./', date.getFullYear(), date.getMonth() + 1, '.txt'].join('');
        let thisMonth = txtName();

        if (!fs.existsSync(thisMonth)) {
            date.setMonth(date.getMonth() - 1);
            let lastMonth = txtName();
            if (fs.existsSync(lastMonth)) {
                execSync(`tail -n 1000 ${lastMonth} > ${thisMonth}`)
            }
        }

        this.fd = fs.openSync(thisMonth, 'a+');
        this.record = fs.readFileSync(this.fd);
    }
    getName(url) {
        let {blog_name: blog, id: postId} = this.post;

        return `${blog}-${postId}-${path.basename(url)}`;
    }
    getDest(name) {
        return `${this.dir}/${name}`;
    }
    checkURLRec(url) {
        return this.record.includes(url);
    }
    writeURLRec(url) {
        return fs.appendFileSync(this.fd, `${url}\n`);
    }
    got({url, name}) {
        const  dest = this.getDest(name);

        return got(url, {
            encoding: null,
            timeout: {
                request: 60e3,
            },
            retry: 3,
            hooks: {
                beforeRetry: [(opt, err, retryN) => {
                    console.log("[Retry]", opt.href)
                }]
            }
        }).then(resp => {
            log(`Downloaded: ${url}`);
            fs.writeFileSync(dest, resp.body);
            this.downded += 1;
            this.writeURLRec(url);

            return url;
        }).catch(err => {
            log(`Error: ${url}`);
            return err
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
        return this.downer.enQueueAll(dls);
    }
    *downLikes() {
        fs.existsSync(this.dir) || fs.mkdirSync(this.dir);

        let offset = 0, page = 1, max = this.max, limit = this.step;

        while (offset < max) {
            limit = Math.min(max - offset, this.step);

            try {
                log(`Fetching Page ${page}`);

                let {
                    liked_posts: posts,
                    liked_count: total,
                } = yield this.client.userLikes({offset, limit});

                max = Math.min(total, this.max);

                yield this.downSave(this.parse(posts));
            }
            catch (e) {
                console.error(e);
            }
            finally {
                if (this.skipped) {
                    log(`Skipped: ${this.skipped}`);

                    this.skipped = 0;
                }

                log(`Fetched Page ${page}\n`);
            }

            offset += limit;
            page += 1;
        }

        log(`Post parsed: ${this.parsed}`);
        log(`Things downed: ${this.downded}`);
    }
}

module.exports = Tumblr;