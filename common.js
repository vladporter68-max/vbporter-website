// ============================================================
// common.js -- shared across every page (nav menu, footer year,
// practice-area tabs, calculator popup collapse/reopen, and the
// news ticker). Elements this looks for that don't exist on a
// given page are simply skipped, so it's safe to include on all
// six pages without any page needing to opt out.
// ============================================================

  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  navToggle.addEventListener('click', () => {
    const isOpen = navMenu.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', isOpen);
  });
  navMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    navMenu.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }));

  document.getElementById('year').textContent = new Date().getFullYear();

  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected','true');
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Popup window close/reopen behavior
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const win = document.getElementById(btn.dataset.close);
      const reopen = document.querySelector(`[data-reopen="${btn.dataset.close}"]`);
      win.classList.add('is-closed');
      if (reopen) reopen.classList.add('is-visible');
    });
  });
  document.querySelectorAll('[data-reopen]').forEach(btn => {
    btn.addEventListener('click', () => {
      const win = document.getElementById(btn.dataset.reopen);
      win.classList.remove('is-closed');
      btn.classList.remove('is-visible');
    });
  });

(function(){
    var track = document.getElementById('newsTicker');
    if(!track) return;

    // The news ticker converts RSS to JSON via rss2json.com. Without an API
    // key, that service shares one small anonymous quota across every site
    // using it -- it can start returning errors after just a handful of
    // requests. A free key raises that to 10,000 requests/day for this site
    // alone, which is what keeps the ticker showing live headlines reliably.
    //
    // ONE-TIME SETUP (only needs doing once):
    //   1. Go to https://rss2json.com/sign-up and create a free account
    //      (email, or sign in with Google/GitHub/Twitter)
    //   2. Once logged in, go to https://rss2json.com/me/api_key
    //   3. Copy the API key shown there and paste it below, replacing
    //      "YOUR_RSS2JSON_API_KEY_HERE"
    //   That's the only place it needs to go in this file.
    var RSS2JSON_API_KEY = 'YOUR_RSS2JSON_API_KEY_HERE';

    var feeds = [
      'https://commercialobserver.com/feed',   // commercial real estate news
      'https://therealdeal.com/new-york/feed' // NYC real estate news (commercial + residential)
    ];

    Promise.all(feeds.map(function(feedUrl){
      var apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(feedUrl) + '&count=6';
      if (RSS2JSON_API_KEY && RSS2JSON_API_KEY !== 'YOUR_RSS2JSON_API_KEY_HERE'){
        apiUrl += '&api_key=' + encodeURIComponent(RSS2JSON_API_KEY);
      }
      return fetch(apiUrl).then(function(r){ return r.json(); }).catch(function(){ return null; });
    })).then(function(results){
      var headlines = [];
      results.forEach(function(data){
        if(data && data.status === 'ok' && data.items && data.items.length){
          headlines = headlines.concat(data.items.slice(0, 6));
        }
      });
      if(!headlines.length) return;

      // Interleave commercial/residential so the ticker alternates between them
      var half = Math.ceil(headlines.length / 2);
      var commercial = headlines.slice(0, half);
      var residential = headlines.slice(half);
      var merged = [];
      var max = Math.max(commercial.length, residential.length);
      for (var i = 0; i < max; i++) {
        if (commercial[i]) merged.push(commercial[i]);
        if (residential[i]) merged.push(residential[i]);
      }

      track.innerHTML = '';
      for (var g = 0; g < 2; g++) {
        var group = document.createElement('span');
        merged.forEach(function(item){
          // Only render items with a normal http(s) link -- guards against a
          // malformed feed entry ever producing an unsafe or broken href.
          if (!item.link || !/^https?:\/\//i.test(item.link) || !item.title) return;
          var wrap = document.createElement('span');
          var a = document.createElement('a');
          a.href = item.link;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = item.title;
          a.style.color = 'inherit';
          a.style.textDecoration = 'none';
          wrap.appendChild(a);
          group.appendChild(wrap);
        });
        track.appendChild(group);
      }
    }).catch(function(err){
      // Live feeds unreachable (e.g. testing locally) -- fallback deal-activity items already in the page stay put.
      console.warn('[news ticker] could not load live feeds, showing fallback items instead:', err);
    });
  })();
  
