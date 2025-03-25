$(document).ready(function(){
  // Глобальные переменные
  window.currentProject = null;
  window.canEdit = false;       // true – режим редактирования, false – только просмотр
  window.heartbeatInterval = null;
  window.autoRefreshInterval = null;

  // Дополнительные переменные для автосохранения
  var autoSaveTimer = null;
  var autoSaveXHR = null;

  // Функция отмены автосохранения (таймер и AJAX-запрос)
  function cancelAutoSave() {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (autoSaveXHR && autoSaveXHR.readyState !== 4) {
      autoSaveXHR.abort();
      autoSaveXHR = null;
    }
  }

  // Функция запуска автосохранения с дебаунсом
  function startAutoSave() {
    // Сбрасываем предыдущий таймер, если он есть
    if(autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function(){
      var project = window.currentProject;
      var content = $('#editor').html();
      if (!project || !window.canEdit) return;
      // Если контент пустой, не сохраняем (можно настроить по необходимости)
      if (!content || content.trim() === "") return;
      
      // Сохраняем текущий проект в локальной переменной, чтобы убедиться в актуальности в callback-е
      var currentSnapshot = project;
      
      // Отправляем запрос на сохранение и сохраняем jqXHR для возможности отмены
      autoSaveXHR = saveProject(currentSnapshot, content, function(data){
         // Проверяем, что активный проект не изменился за время сохранения
         if(window.currentProject === currentSnapshot) {
           console.log("Автосохранение завершено:", data);
         } else {
           console.log("Результат автосохранения для устаревшего проекта проигнорирован.");
         }
      });
      
      autoSaveTimer = null;
    }, 3000);
  }

  // Функция открытия проекта
  function openProject(project) {
    // При переключении проекта отменяем автосохранение и все интервалы
    cancelAutoSave();
    if(window.heartbeatInterval) clearInterval(window.heartbeatInterval);
    if(window.autoRefreshInterval) {
      clearInterval(window.autoRefreshInterval);
      window.autoRefreshInterval = null;
    }
    window.currentProject = project;
    $.get('/load_project', { project_name: project }, function(data) {
      if (data.success) {
        $('#editor').html(data.content);
        $('#main-header').fadeOut(200, function() {
          $(this).text(project).fadeIn(200);
        });
        document.title = project + " | Мастерская";
        $('.project-item').removeClass('selected');
        $('.project-item[data-project="' + project + '"]').addClass('selected');
        resetAudioPlayer();

        window.canEdit = data.can_edit;
        if(window.canEdit) {
          enableEditingMode();
        } else {
          enableViewOnlyMode();
          alert(data.message);
        }
        // Запускаем heartbeat каждые 3 секунды
        window.heartbeatInterval = setInterval(sendHeartbeat, 3000);
      } else {
        $('#editor').html('');
        $('#main-header').text("Мастерская - Библиотека");
        document.title = "Мастерская - Проекты";
        alert(data.error);
      }
    });
  }

  // Функция heartbeat для обновления статуса
  function sendHeartbeat() {
    if (!window.currentProject) return;
    $.post('/heartbeat', { project_name: window.currentProject }, function(data) {
      if(data.success) {
        if(window.canEdit !== data.can_edit) {
          window.canEdit = data.can_edit;
          if(window.canEdit) {
            enableEditingMode();
            alert("Предыдущий редактор ушёл, теперь вы можете редактировать проект.");
          } else {
            enableViewOnlyMode();
            alert("Проект сейчас редактируется пользователем " + data.editor);
          }
        }
      }
    });
  }

  // Режим редактирования: делаем редактор доступным и включаем автосохранение по изменению контента
  function enableEditingMode() {
    if(window.autoRefreshInterval) {
      clearInterval(window.autoRefreshInterval);
      window.autoRefreshInterval = null;
    }
    $('#editor').attr('contenteditable', true);
    // Удаляем предыдущий обработчик, чтобы не дублировать его
    $('#editor').off('input.autoSave');
    // При каждом изменении в редакторе запускаем дебаунс автосохранения
    $('#editor').on('input.autoSave', function(){
      startAutoSave();
    });
  }

  // Режим просмотра: отключаем автосохранение и включаем автообновление содержимого
  function enableViewOnlyMode() {
    cancelAutoSave();
    $('#editor').off('input.autoSave');
    $('#editor').attr('contenteditable', false);
    if(!window.autoRefreshInterval) {
      window.autoRefreshInterval = setInterval(function(){
        if(window.currentProject && !window.canEdit) {
          $.get('/get_project_content', { project_name: window.currentProject }, function(data){
            if(data.success) {
              $('#editor').html(data.content);
            }
          });
        }
      }, 3000);
    }
  }

  // Функция сохранения с поддержкой чанков.
  // Возвращает jqXHR для возможности отмены запроса.
  function saveProject(project, content, callback) {
    var maxChunkSize = 100 * 1024; // 100 КБ
    if (content.length > maxChunkSize) {
      var chunks = [];
      for (var i = 0; i < content.length; i += maxChunkSize) {
        chunks.push(content.substring(i, i + maxChunkSize));
      }
      var totalChunks = chunks.length;
      function sendChunk(index) {
        return $.post('/save_project', {
          project_name: project,
          content: chunks[index],
          chunk_number: index + 1,
          total_chunks: totalChunks
        }, function(data) {
          if (data.success) {
            if (index < totalChunks - 1) {
              sendChunk(index + 1);
            } else {
              if (callback) callback(data);
            }
          } else {
            if (callback) callback(data);
          }
        });
      }
      return sendChunk(0);
    } else {
      return $.post('/save_project', {
        project_name: project,
        content: content,
        chunk_number: 1,
        total_chunks: 1
      }, function(data) {
        if (callback) callback(data);
      });
    }
  }
  
  // Новый обработчик поиска проектов через серверный эндпоинт /search_projects
  $('#search-projects').on('input', function(){
    var query = $(this).val().trim();
    $.get('/search_projects', { query: query, offset: 0, limit: 10 }, function(data){
      if(data.success){
        var container = $('#projects-container');
        container.empty();
        data.projects.forEach(function(project){
          var projectItem = $('<div class="project-item" data-project="'+ project +'"><span class="proj-name">'+ project +'</span></div>');
          projectItem.on('click', function(){
            openProject(project);
          }).on('contextmenu', function(e){
            e.preventDefault();
            showContextMenu(project, e.pageX, e.pageY);
          });
          container.append(projectItem);
        });
      } else {
        alert(data.error);
      }
    });
  });

  // Исправляем кнопку «Загрузить ещё» — теперь не перезагружает страницу и дописывает новые проекты
  $('#load_more').on('click', function(e){
    e.preventDefault(); // предотвращает перезагрузку страницы
    var query = $('#search-projects').val().trim();
    var currentCount = $('.project-item').length;
    $.get('/search_projects', { query: query, offset: currentCount, limit: 10 }, function(data){
      if(data.success){
        var container = $('#projects-container');
        data.projects.forEach(function(project){
          var projectItem = $('<div class="project-item" data-project="'+ project +'"><span class="proj-name">'+ project +'</span></div>');
          projectItem.on('click', function(){
            openProject(project);
          }).on('contextmenu', function(e){
            e.preventDefault();
            showContextMenu(project, e.pageX, e.pageY);
          });
          container.append(projectItem);
        });
      } else {
        alert(data.error);
      }
    });
  });

  // Обработка контекстного меню для элементов проектов
  $('.project-item').each(function(){
    var $item = $(this);
    var project = $item.data('project');
    $item.on('click', function(){
      openProject(project);
    });
    $item.on('contextmenu', function(e){
      e.preventDefault();
      showContextMenu(project, e.pageX, e.pageY);
    });
  });
  
  function showContextMenu(project, x, y) {
    var isFav = $('.project-item[data-project="' + project + '"]').data('fav') === '★';
    $('#ctx-fav').text(isFav ? 'Убрать из избранного' : 'Добавить в избранное');
    $('#context-menu').data('project', project)
      .css({ top: y, left: x })
      .fadeIn(200);
  }
  
  $(document).on('click', function(e){
    if (!$(e.target).closest('#context-menu').length) {
      $('#context-menu').fadeOut(200);
    }
  });
  
  $('#ctx-open').click(function(){
    var project = $('#context-menu').data('project');
    openProject(project);
    $('#context-menu').fadeOut(200);
  });
  
  $('#ctx-rename').click(function() {
    var project = $('#context-menu').data('project');
    var rawNewName = prompt("Введите новое название проекта", project);
    if (rawNewName) {
      var newName = rawNewName.trim();
      if (newName && newName !== project) {
        $.ajax({
          url: '/rename_project',
          method: 'POST',
          contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
          data: {
            old_name: project,
            new_name: newName
          },
          success: function(data) {
            if (data.success) {
              $('[data-project="' + project + '"]').text(newName);
              $('#context-menu').data('project', newName);
              showNotification('Проект успешно переименован', 'success');
            } else {
              showNotification('Ошибка: ' + data.error, 'error');
            }
          },
          error: function(xhr) {
            showNotification('Ошибка соединения: ' + xhr.statusText, 'error');
          },
          complete: function() {
            $('#context-menu').fadeOut(200);
          }
        });
      }
    } else {
      $('#context-menu').fadeOut(200);
    }
  });
  
  $('#ctx-delete').click(function(){
    var project = $('#context-menu').data('project');
    if (confirm("Вы действительно хотите удалить проект \"" + project + "\"?")) {
      $.post('/delete_project', { project_name: project }, function(data){
        if (data.success) { 
          location.reload(); 
        } else { 
          alert(data.error); 
        }
      });
    }
  });
  
  $('#ctx-fav').click(function(){
    var project = $('#context-menu').data('project');
    var isFav = $('.project-item[data-project="' + project + '"]').data('fav') === '★';
    var action = isFav ? 'remove' : 'add';
    $.post('/favorite_project', { project_name: project, action: action }, function(data){
      if (data.success) { 
        var $item = $('.project-item[data-project="' + project + '"]');
        if (action === 'add') {
          $item.data('fav', '★')
               .find('.proj-name').html('★ ' + project);
          $('#projects-container').prepend($item.detach());
        } else {
          $item.data('fav', '')
               .find('.proj-name').text(project);
          $('#projects-container').append($item.detach());
        }
      }
    });
  });
  
  $('#new-project').click(function(){
    var name = prompt("Введите название нового проекта");
    if (name) {
      $.post('/create_project', { project_name: name }, function(data){
        if (data.success) { location.reload(); } else { alert(data.error); }
      });
    }
  });
  
  // Ручное сохранение проекта
  $('#save').click(function(){
    cancelAutoSave();
    var project = window.currentProject;
    if (!project) {
      alert("Выберите проект");
      return;
    }
    var content = $('#editor').html();
    saveProject(project, content, function(data){
      if (data.success) { 
        alert("Сохранено"); 
      } else { 
        alert(data.error); 
      }
    });
  });

$(document).keydown(function(e) {
    if (e.ctrlKey && e.which === 81) { // Shift + S
      e.preventDefault();
      cancelAutoSave();
      var project = window.currentProject;
      if (!project) {
        alert("Выберите проект");
        return;
      }
      var content = $('#editor').html();
      saveProject(project, content, function(data){
        if (data.success) { 
          alert("Сохранено"); 
        } else { 
          alert(data.error); 
        }
      });
    }
  });
});
