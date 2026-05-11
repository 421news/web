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
      title: 'Comentarios',
      placeholder: 'Dejá tu comentario...',
      reply: 'Responder',
      edit: 'Editar',
      delete: 'Eliminar',
      save: 'Publicar',
      cancel: 'Cancelar',
      saving: 'Publicando...',
      edited: 'editado',
      login: 'Iniciá sesión para comentar',
      paidOnly: 'Los comentarios son exclusivos para Wizards.',
      become: 'Hacete Wizard',
      noComments: 'Sé el primero en comentar.',
      confirmDelete: '¿Eliminar este comentario?',
      loadMore: 'Cargar más',
      ago: { s: 'hace un momento', m: 'hace 1 min', mm: 'hace %d min', h: 'hace 1 hora', hh: 'hace %d horas', d: 'hace 1 día', dd: 'hace %d días' }
    },
    en: {
      title: 'Comments',
      placeholder: 'Leave a comment...',
      reply: 'Reply',
      edit: 'Edit',
      delete: 'Delete',
      save: 'Post',
      cancel: 'Cancel',
      saving: 'Posting...',
      edited: 'edited',
      login: 'Sign in to comment',
      paidOnly: 'Comments are exclusive to Wizards.',
      become: 'Become a Wizard',
      noComments: 'Be the first to comment.',
      confirmDelete: 'Delete this comment?',
      loadMore: 'Load more',
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

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

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
    if (m && m.avatar_image) {
      return '<img class="c421-avatar" src="' + esc(m.avatar_image) + '" alt="">';
    }
    var name = m ? m.name : '?';
    return '<div class="c421-avatar c421-avatar-initials" style="background:' + avatarColor(name) + '">' + esc(initials(name)) + '</div>';
  }

  function renderComment(c, isReply) {
    var isOwn = member && member.uuid === c.member.uuid;
    var isPaid = c.member.status === 'paid';
    var replies = '';
    if (c.replies && c.replies.length && !isReply) {
      replies = '<div class="c421-replies">' + c.replies.map(function (r) { return renderComment(r, true); }).join('') + '</div>';
    }
    var actions = '<div class="c421-actions">';
    actions += '<button class="c421-action c421-like-btn" data-id="' + c.id + '" data-liked="' + (c.liked ? '1' : '0') + '">' +
      '<svg viewBox="0 0 24 24" fill="' + (c.liked ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
      (c.count && c.count.likes ? '<span class="c421-like-count">' + c.count.likes + '</span>' : '') +
      '</button>';
    if (!isReply && member) {
      actions += '<button class="c421-action c421-reply-btn" data-id="' + c.id + '">' + t.reply + '</button>';
    }
    if (isOwn) {
      actions += '<button class="c421-action c421-edit-btn" data-id="' + c.id + '">' + t.edit + '</button>';
      actions += '<button class="c421-action c421-delete-btn" data-id="' + c.id + '">' + t.delete + '</button>';
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
          '<button class="c421-cancel-btn">' + t.cancel + '</button>' +
          '<button class="c421-submit-btn">' + t.save + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderAll() {
    var countText = comments.length > 0 ? ' <span class="c421-count">(' + comments.length + ')</span>' : '';
    var html = '<h2 class="c421-title">' + t.title + countText + '</h2>';

    if (!member && commentsEnabled === 'paid') {
      html += '<div class="c421-gate">' +
        '<p>' + t.paidOnly + '</p>' +
        '<a href="' + subscribePath + '" class="c421-gate-btn">' + t.become + ' &rarr;</a>' +
      '</div>';
    } else if (!member) {
      html += '<div class="c421-gate">' +
        '<p>' + t.login + '</p>' +
        '<button class="c421-gate-btn" onclick="window.location.hash=\'#/portal/signin\'">' + t.login + '</button>' +
      '</div>';
    } else if (member && commentsEnabled === 'paid' && member.status !== 'paid') {
      html += '<div class="c421-gate">' +
        '<p>' + t.paidOnly + '</p>' +
        '<a href="' + subscribePath + '" class="c421-gate-btn">' + t.become + ' &rarr;</a>' +
      '</div>';
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
    bindEvents();
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  function bindEvents() {
    // Textarea auto-grow + show actions
    container.querySelectorAll('.c421-input').forEach(function (el) {
      el.addEventListener('input', function () { autoGrow(this); });
      el.addEventListener('focus', function () {
        this.closest('.c421-compose').querySelector('.c421-compose-actions').style.display = 'flex';
      });
    });

    // Cancel
    container.querySelectorAll('.c421-cancel-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var compose = this.closest('.c421-compose');
        var parentId = compose.getAttribute('data-parent');
        if (parentId) {
          compose.remove();
        } else {
          var inp = compose.querySelector('.c421-input');
          inp.value = '';
          inp.style.height = 'auto';
          compose.querySelector('.c421-compose-actions').style.display = 'none';
        }
      });
    });

    // Submit
    container.querySelectorAll('.c421-submit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var compose = this.closest('.c421-compose');
        var textarea = compose.querySelector('.c421-input');
        var text = textarea.value.trim();
        if (!text) return;
        var parentId = compose.getAttribute('data-parent') || null;
        this.textContent = t.saving;
        this.disabled = true;
        postComment(text, parentId).then(function () {
          textarea.value = '';
          loadComments().then(renderAll);
        }).catch(function () {
          btn.textContent = t.save;
          btn.disabled = false;
        });
      });
    });

    // Reply
    container.querySelectorAll('.c421-reply-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        var box = container.querySelector('.c421-reply-box[data-parent="' + id + '"]');
        if (box.style.display === 'none') {
          box.style.display = 'block';
          box.innerHTML = renderCompose(id);
          bindEvents(); // rebind for new compose
          box.querySelector('.c421-input').focus();
        } else {
          box.style.display = 'none';
          box.innerHTML = '';
        }
      });
    });

    // Like
    container.querySelectorAll('.c421-like-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!member) return;
        var id = this.getAttribute('data-id');
        var liked = this.getAttribute('data-liked') === '1';
        toggleLike(id, liked).then(function () {
          loadComments().then(renderAll);
        });
      });
    });

    // Edit
    container.querySelectorAll('.c421-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        var commentEl = container.querySelector('.c421-comment[data-id="' + id + '"]');
        var textEl = commentEl.querySelector('.c421-text');
        var currentHTML = textEl.innerHTML;
        var currentText = textEl.textContent.trim();
        var actionsEl = commentEl.querySelector('.c421-actions');

        textEl.innerHTML = '<textarea class="c421-input c421-edit-input" rows="2">' + esc(currentText) + '</textarea>' +
          '<div class="c421-compose-actions" style="display:flex;">' +
            '<button class="c421-cancel-edit">' + t.cancel + '</button>' +
            '<button class="c421-save-edit" data-id="' + id + '">' + t.save + '</button>' +
          '</div>';
        actionsEl.style.display = 'none';

        var editInput = textEl.querySelector('.c421-edit-input');
        autoGrow(editInput);
        editInput.addEventListener('input', function () { autoGrow(this); });
        editInput.focus();

        textEl.querySelector('.c421-cancel-edit').addEventListener('click', function () {
          textEl.innerHTML = currentHTML;
          actionsEl.style.display = '';
        });

        textEl.querySelector('.c421-save-edit').addEventListener('click', function () {
          var newText = editInput.value.trim();
          if (!newText || newText === currentText) {
            textEl.innerHTML = currentHTML;
            actionsEl.style.display = '';
            return;
          }
          this.textContent = t.saving;
          this.disabled = true;
          editComment(id, newText).then(function () {
            loadComments().then(renderAll);
          });
        });
      });
    });

    // Delete
    container.querySelectorAll('.c421-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        if (!confirm(t.confirmDelete)) return;
        deleteComment(id).then(function () {
          loadComments().then(renderAll);
        });
      });
    });

    // Load more
    var loadMoreBtn = container.querySelector('.c421-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', function () {
        this.disabled = true;
        this.textContent = '...';
        loadComments(pagination.next).then(function (append) {
          renderAll();
        });
      });
    }
  }

  // API calls
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

  function loadComments(page) {
    var url = 'comments/?filter=post_id:' + postId + '&limit=20&order=created_at%20desc';
    if (page) url += '&page=' + page;
    return apiCall('GET', url).then(function (data) {
      if (page && page > 1) {
        comments = comments.concat(data.comments || []);
      } else {
        comments = data.comments || [];
      }
      pagination = data.meta ? data.meta.pagination : null;
      return data;
    });
  }

  function postComment(text, parentId) {
    var body = { comments: [{ html: '<p>' + esc(text).replace(/\n/g, '</p><p>') + '</p>', post_id: postId }] };
    if (parentId) body.comments[0].parent_id = parentId;
    return apiCall('POST', 'comments/', body);
  }

  function editComment(id, text) {
    return apiCall('PUT', 'comments/' + id + '/', {
      comments: [{ html: '<p>' + esc(text).replace(/\n/g, '</p><p>') + '</p>' }]
    });
  }

  function deleteComment(id) {
    return apiCall('DELETE', 'comments/' + id + '/');
  }

  function toggleLike(id, currentlyLiked) {
    return apiCall(currentlyLiked ? 'DELETE' : 'POST', 'comments/' + id + '/like/');
  }

  // Init
  function init() {
    container.innerHTML = '<p class="c421-loading">...</p>';

    // Check member status
    fetch('/members/api/member/', { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok || r.status === 204) return null;
        return r.json();
      })
      .then(function (m) {
        if (m && m.email) {
          member = m;
          // Ghost returns paid:true for paid+comped, or status string
          if (m.paid === true) member.status = 'paid';
          else if (m.subscriptions && m.subscriptions.length) member.status = 'paid';
          else if (!member.status) member.status = 'free';
        }
      })
      .catch(function () {})
      .then(function () {
        return loadComments();
      })
      .then(renderAll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
