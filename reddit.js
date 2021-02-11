const SEARCH_API =
  'https://api.reddit.com/search.json?sort=top&t=all&limit=100&q=url:';
const INFO_API = 'https://reddit.com/api/info.json?url=';

function parseQuery(qstring) {
  qstring = qstring || location.href;
  let query = {};
  qstring = qstring.split('?');
  qstring = qstring.length == 1 ? '' : qstring.pop();
  let a = (qstring[0] === '?' ? qstring.substr(1) : qstring).split('&');
  for (let i = 0; i < a.length; i++) {
    let b = a[i].split('=');
    if (b[0]) {
      query[decodeURIComponent(b[0])] = decodeURIComponent(b[1] || '');
    }
  }
  return query;
}

function normalizeYoutube(url) {
  if (url.includes('youtu.be/')) {
    url = url.split('/').pop();
    return `https://www.youtube.com/watch?v=${url}`;
  } else if (url.includes('youtube.com')) {
    url = parseQuery(url).v;
    return `https://www.youtube.com/watch?v=${url}`;
  }
  return url;
}

function removeDuplicates(posts) {
  let seen = {};
  let rawSeen = {};
  posts = posts.sort((a, b) => b.data.num_comments - a.data.num_comments);
  posts = posts.map((post) => {
    let url = normalizeYoutube(post.data.url);
    let dupe = seen[url];
    seen[url] = (seen[url] || 0) + 1;
    rawSeen[post.data.url] = (rawSeen[post.data.url] || 0) + 1;
    if (!dupe) {
      return post;
    }
  });
  posts = posts.filter((post) => post);
  posts = posts.map((post) => {
    let dupes = rawSeen[post.data.url];
    if (dupes > 1) {
      post.data.permalink = post.data.permalink.replace(
        '/comments/',
        '/duplicates/'
      );
    }
    post.data.dupes = dupes;
    return post;
  });
  return posts;
}

function findOnReddit(url, useCache = true, exact = true) {
  let query = encodeURIComponent(url);
  let results = search(query, useCache, exact);
  results
    .then((res) => {
      cachePosts(query, res, exact);
    })
    .catch(ignoreRejection);
  return results;
}

function search(query, useCache = true, exact = true) {
  let requestUrl = `${exact ? INFO_API : SEARCH_API}${query}`;
  if (!useCache) {
    return makeApiRequest(requestUrl).then((res) => res.data.children);
  }
  return searchCache(query).then((cache) => {
    let data = cache[query] || {};
    let key = exact ? 'exact' : 'nonExact';
    let otherResults = data[exact ? 'nonExact' : 'exact'];
    return checkCacheValidity(data, key).then((isValid) => {
      if (isValid) {
        posts = data[key].posts;
        if (otherResults) {
          posts.other = otherResults.posts.length;
        }
        return posts;
      } else {
        let res = makeApiRequest(requestUrl).then((res) => res.data.children);
        if (otherResults) {
          res.then((posts) => {
            posts.other = otherResults.posts.length;
            return posts;
          });
        }
        return res;
      }
    });
  });
}

function makeApiRequest(url) {
  return new Promise((resolve, reject) => {
    $.get(url).done(resolve).fail(reject);
  });
}

function cachePosts(query, posts, exact) {
  let key = exact ? 'exact' : 'nonExact';
  searchCache(query).then((c) => {
    let objectToStore = {};
    let data = c[query] || {};
    data[key] = {
      posts: posts,
      time: Date.now(),
    };
    objectToStore[query] = data;
    return cache(objectToStore);
  });
}

function checkCacheValidity(cache, key) {
  if (!cache.hasOwnProperty(key)) {
    return Promise.resolve(false);
  }
  let data = cache[key];
  if (!(data.time && data.posts)) {
    return Promise.resolve(false);
  }
  let diff = Date.now() - data.time;
  let query = { options: { cache: { period: DEFAULT_CACHE_PERIOD_MINS } } };
  return getOptions(query).then((opts) => diff < +opts.cache.period * 60e3);
}
