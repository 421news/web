// Custom comments UI for 421.news (replaces Ghost comments-ui iframe)
(function () {
  var container = document.querySelector('.post-comments[data-post-id]');
  if (!container) return;

  var postId = container.getAttribute('data-post-id');
  var commentsEnabled = container.getAttribute('data-comments-enabled') || 'paid';
  if (!postId) return;

  var langMatch = location.pathname.match(/^\/([a-z]{2})\//);
  var lang = langMatch ? langMatch[1] : 'es';

  var i18n = {
    es: {
      title: 'Comentarios', placeholder: 'Dejá tu comentario...',
      reply: 'Responder', edit: 'Editar', delete: 'Eliminar',
      save: 'Publicar', cancel: 'Cancelar', saving: 'Publicando...',
      edited: 'editado', deleted: 'Este comentario fue eliminado.',
      login: 'Iniciá sesión para comentar',
      paidOnly: 'Los comentarios son exclusivos para Wizards.',
      become: 'Hacete Wizard', noComments: 'Sé el primero en comentar.',
      confirmDelete: '¿Eliminar este comentario?', loadMore: 'Cargar más',
      ago: { s: 'hace un momento', m: 'hace 1 min', mm: 'hace %d min', h: 'hace 1 hora', hh: 'hace %d horas', d: 'hace 1 día', dd: 'hace %d días' }
    },
    en: {
      title: 'Comments', placeholder: 'Leave a comment...',
      reply: 'Reply', edit: 'Edit', delete: 'Delete',
      save: 'Post', cancel: 'Cancel', saving: 'Posting...',
      edited: 'edited', deleted: 'This comment has been removed.',
      login: 'Sign in to comment',
      paidOnly: 'Comments are exclusive to Wizards.',
      become: 'Become a Wizard', noComments: 'Be the first to comment.',
      confirmDelete: 'Delete this comment?', loadMore: 'Load more',
      ago: { s: 'just now', m: '1 min ago', mm: '%d min ago', h: '1 hour ago', hh: '%d hours ago', d: '1 day ago', dd: '%d days ago' }
    }
  };
  var t = i18n[lang] || i18n.es;
  var subscribePath = lang === 'en' ? '/en/subscribe/' : '/es/suscribite/';

  var member = null;
  var comments = [];
  var pagination = null;

  function timeAgo(dateStr) {
    var diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return t.ago.s;
    var mins = Math.floor(diff / 60);
    if (mins < 60) return mins === 1 ? t.ago.m : t.ago.mm.replace('%d', mins);
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs === 1 ? t.ago.h : t.ago.hh.replace('%d', hrs);
    var days = Math.floor(hrs / 24);
    if (days <= 30) return days === 1 ? t.ago.d : t.ago.dd.replace('%d', days);
    return new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function initials(name) {
    return (name || '?').split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
  }

  function avatarColor(name) {
    var h = 0;
    for (var i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    var colors = ['#e8a87c', '#a8d8ea', '#c3aed6', '#d4a5a5', '#95e1d3', '#f38181', '#aa96da', '#fcbad3', '#a1c4fd', '#fbc2eb'];
    return colors[Math.abs(h) % colors.length];
  }

  function renderAvatar(m) {
    if (m && m.avatar_image) return '<img class="c421-avatar" src="' + esc(m.avatar_image) + '" alt="">';
    var name = m ? m.name : '?';
    return '<div class="c421-avatar c421-avatar-initials" style="background:' + avatarColor(name) + '">' + esc(initials(name)) + '</div>';
  }

  function renderComment(c, isReply) {
    if (c.status === 'deleted') {
      var hasReplies = c.replies && c.replies.length;
      if (!hasReplies) return '';
      var repliesHtml = '<div class="c421-replies">' + c.replies.map(function (r) { return renderComment(r, true); }).join('') + '</div>';
      return '<div class="c421-comment c421-deleted" data-id="' + c.id + '">' +
        '<div class="c421-avatar c421-avatar-initials" style="background:#555">?</div>' +
        '<div class="c421-body"><p class="c421-text" style="opacity:0.35;font-style:italic">' + t.deleted + '</p></div>' +
      '</div>' + repliesHtml;
    }

    var isOwn = member && member.uuid === c.member.uuid;
    var isPaid = commentsEnabled === 'paid';
    var replies = '';
    if (c.replies && c.replies.length && !isReply) {
      replies = '<div class="c421-replies">' + c.replies.map(function (r) { return renderComment(r, true); }).join('') + '</div>';
    }

    var actions = '<div class="c421-actions">';
    if (member) {
      actions += '<button class="c421-action" data-action="like" data-id="' + c.id + '" data-liked="' + (c.liked ? '1' : '0') + '">' +
        '<svg viewBox="0 0 24 24" fill="' + (c.liked ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
        (c.count && c.count.likes ? '<span class="c421-like-count">' + c.count.likes + '</span>' : '') +
        '</button>';
      if (!isReply) {
        actions += '<button class="c421-action" data-action="reply" data-id="' + c.id + '">' + t.reply + '</button>';
      }
    }
    if (isOwn) {
      actions += '<button class="c421-action" data-action="edit" data-id="' + c.id + '">' + t.edit + '</button>';
      actions += '<button class="c421-action" data-action="delete" data-id="' + c.id + '">' + t.delete + '</button>';
    }
    actions += '</div>';

    var edited = c.edited_at ? ' <span class="c421-edited">(' + t.edited + ')</span>' : '';

    return '<div class="c421-comment' + (isReply ? ' c421-is-reply' : '') + '" data-id="' + c.id + '">' +
      renderAvatar(c.member) +
      '<div class="c421-body">' +
        '<div class="c421-header">' +
          '<span class="c421-author">' + esc(c.member.name || 'Anónimo') + '</span>' +
          (isPaid ? '<span class="c421-badge">WIZARD</span>' : '') +
          '<span class="c421-time">' + timeAgo(c.created_at) + edited + '</span>' +
        '</div>' +
        '<div class="c421-text">' + c.html + '</div>' +
        actions +
        '<div class="c421-reply-box" data-parent="' + c.id + '" style="display:none;"></div>' +
      '</div>' +
    '</div>' + replies;
  }

  function renderCompose(parentId) {
    if (!member) return '';
    return '<div class="c421-compose" data-parent="' + (parentId || '') + '">' +
      renderAvatar(member) +
      '<div class="c421-compose-wrap">' +
        '<textarea class="c421-input" placeholder="' + esc(t.placeholder) + '" rows="1"></textarea>' +
        '<div class="c421-compose-actions" style="display:none;">' +
          '<button class="c421-btn-cancel">' + t.cancel + '</button>' +
          '<button class="c421-btn-submit">' + t.save + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function render() {
    var total = 0;
    comments.forEach(function (c) { if (c.status !== 'deleted') total++; total += (c.replies || []).filter(function (r) { return r.status !== 'deleted'; }).length; });
    var countText = total > 0 ? ' <span class="c421-count">(' + total + ')</span>' : '';
    var html = '<h2 class="c421-title">' + t.title + countText + '</h2>';

    if (!member && commentsEnabled === 'paid') {
      html += '<div class="c421-gate"><p>' + t.paidOnly + '</p><a href="' + subscribePath + '" class="c421-gate-btn">' + t.become + ' &rarr;</a></div>';
    } else if (!member) {
      html += '<div class="c421-gate"><p>' + t.login + '</p><button class="c421-gate-btn" onclick="window.location.hash=\'#/portal/signin\'">' + t.login + '</button></div>';
    } else if (commentsEnabled === 'paid' && member.status !== 'paid') {
      html += '<div class="c421-gate"><p>' + t.paidOnly + '</p><a href="' + subscribePath + '" class="c421-gate-btn">' + t.become + ' &rarr;</a></div>';
    } else {
      html += renderCompose();
    }

    if (comments.length === 0) {
      html += '<p class="c421-empty">' + t.noComments + '</p>';
    } else {
      html += '<div class="c421-list">' + comments.map(function (c) { return renderComment(c, false); }).join('') + '</div>';
    }

    if (pagination && pagination.next) {
      html += '<button class="c421-load-more">' + t.loadMore + '</button>';
    }

    container.innerHTML = html;
  }

  // Single event delegation handler — no re-binding needed
  container.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (btn) {
      var action = btn.getAttribute('data-action');
      var id = btn.getAttribute('data-id');

      if (action === 'like') {
        if (!member) return;
        var liked = btn.getAttribute('data-liked') === '1';
        apiCall(liked ? 'DELETE' : 'POST', 'comments/' + id + '/like').then(reload).catch(function () {});

      } else if (action === 'reply') {
        var box = container.querySelector('.c421-reply-box[data-parent="' + id + '"]');
        if (!box) return;
        if (box.style.display === 'none') {
          box.style.display = 'block';
          box.innerHTML = renderCompose(id);
          box.querySelector('.c421-input').focus();
        } else {
          box.style.display = 'none';
          box.innerHTML = '';
        }

      } else if (action === 'edit') {
        var commentEl = btn.closest('.c421-comment');
        var textEl = commentEl.querySelector('.c421-text');
        var actionsEl = commentEl.querySelector('.c421-actions');
        var currentHTML = textEl.innerHTML;
        var currentText = textEl.textContent.trim();
        textEl.innerHTML = '<textarea class="c421-input c421-edit-input" rows="2">' + esc(currentText) + '</textarea>' +
          '<div class="c421-compose-actions" style="display:flex">' +
            '<button class="c421-btn-cancel-edit">' + t.cancel + '</button>' +
            '<button class="c421-btn-save-edit" data-id="' + id + '">' + t.save + '</button>' +
          '</div>';
        actionsEl.style.display = 'none';
        var editInput = textEl.querySelector('.c421-edit-input');
        editInput.style.height = editInput.scrollHeight + 'px';
        editInput.focus();

      } else if (action === 'delete') {
        if (!confirm(t.confirmDelete)) return;
        fetch('https://webhook-hreflang.onrender.com/api/comments/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment_id: id, member_uuid: member.uuid })
        }).then(function (r) { return r.json(); })
          .then(function (data) { if (data.success) reload(); })
          .catch(function () {});
      }
      return;
    }

    // Save edit
    var saveBtn = e.target.closest('.c421-btn-save-edit');
    if (saveBtn) {
      var editId = saveBtn.getAttribute('data-id');
      var textarea = saveBtn.closest('.c421-text').querySelector('.c421-edit-input');
      var newText = textarea.value.trim();
      if (!newText) return;
      saveBtn.textContent = t.saving;
      saveBtn.disabled = true;
      apiCall('PUT', 'comments/' + editId, {
        comments: [{ html: '<p>' + esc(newText).replace(/\n/g, '</p><p>') + '</p>' }]
      }).then(reload).catch(function () { saveBtn.textContent = t.save; saveBtn.disabled = false; });
      return;
    }

    // Cancel edit
    if (e.target.closest('.c421-btn-cancel-edit')) {
      reload();
      return;
    }

    // Submit comment
    var submitBtn = e.target.closest('.c421-btn-submit');
    if (submitBtn) {
      var compose = submitBtn.closest('.c421-compose');
      var input = compose.querySelector('.c421-input');
      var text = input.value.trim();
      if (!text) return;
      var parentId = compose.getAttribute('data-parent') || null;
      submitBtn.textContent = t.saving;
      submitBtn.disabled = true;
      var body = { comments: [{ html: '<p>' + esc(text).replace(/\n/g, '</p><p>') + '</p>', post_id: postId }] };
      if (parentId) body.comments[0].parent_id = parentId;
      apiCall('POST', 'comments', body).then(reload).catch(function () { submitBtn.textContent = t.save; submitBtn.disabled = false; });
      return;
    }

    // Cancel compose
    var cancelBtn = e.target.closest('.c421-btn-cancel');
    if (cancelBtn) {
      var compose = cancelBtn.closest('.c421-compose');
      var parentId = compose.getAttribute('data-parent');
      if (parentId) {
        var box = compose.closest('.c421-reply-box');
        if (box) { box.style.display = 'none'; box.innerHTML = ''; }
      } else {
        var inp = compose.querySelector('.c421-input');
        inp.value = '';
        inp.style.height = 'auto';
        compose.querySelector('.c421-compose-actions').style.display = 'none';
      }
      return;
    }
  });

  // Auto-grow textareas
  container.addEventListener('input', function (e) {
    if (e.target.matches('.c421-input')) {
      e.target.style.height = 'auto';
      e.target.style.height = e.target.scrollHeight + 'px';
    }
  });

  // Show compose actions on focus
  container.addEventListener('focusin', function (e) {
    if (e.target.matches('.c421-input')) {
      var actions = e.target.closest('.c421-compose');
      if (actions) {
        var btns = actions.querySelector('.c421-compose-actions');
        if (btns) btns.style.display = 'flex';
      }
    }
  });

  // API
  function apiCall(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch('/members/api/' + path, opts).then(function (r) {
      if (!r.ok) throw new Error('API ' + r.status);
      if (r.status === 204) return {};
      return r.json();
    });
  }

  function reload() {
    return apiCall('GET', 'comments/?filter=post_id:' + postId + '&limit=20&order=created_at%20desc')
      .then(function (data) {
        comments = data.comments || [];
        pagination = data.meta ? data.meta.pagination : null;
        render();
      });
  }

  // Init
  function init() {
    container.innerHTML = '<p class="c421-loading">...</p>';
    fetch('/members/api/member/', { credentials: 'same-origin' })
      .then(function (r) { return (!r.ok || r.status === 204) ? null : r.json(); })
      .then(function (m) {
        if (m && m.email) {
          member = m;
          if (m.paid === true) member.status = 'paid';
          else if (m.subscriptions && m.subscriptions.length) member.status = 'paid';
          else if (!member.status) member.status = 'free';
        }
      })
      .catch(function () {})
      .then(reload);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
