// task.js
$(document).ready(function() {
  // Глобальный счётчик для уникальных id задач (для остальных элементов, не для кнопки "Добавить трекер")
  var taskCounter = 0;

  // Функция для создания нового контейнера задач (таймлайн-контейнера)
  function createTaskContainer() {
    var $container = $('<div>', {
      id: 'task_container_' + (++taskCounter),
      class: 'task-list'
    });
    $('#editor').append($container);
    return $container;
  }
  
  // Функция для создания нового элемента задачи с точкой таймлайна и деталями
  function createNewTask() {
    var currentId = ++taskCounter;
    // Создаём задачу с состоянием "pending"
    var $task = $('<div>', {
      id: 'task_' + currentId,
      class: 'task',
      'data-state': 'pending',
      contenteditable: false
    });
    
    // Элемент точки таймлайна
    var $dot = $('<div>', { id: 'task_' + currentId + '_dot', class: 'task-dot' });
    var $dotLabel = $('<span>', { 
      id: 'task_' + currentId + '_dot_label', 
      class: 'dot-state-label' 
    }).text('В ожидании');
    $dot.append($dotLabel);
    
    // Контейнер деталей задачи
    var $details = $('<div>', { id: 'task_' + currentId + '_details', class: 'task-details' });
    
    // Контейнер для названия задачи: поле ввода, кнопки "Добавить трекер", "Сохранить" и статичный заголовок.
    var $titleContainer = $('<div>', {
      id: 'task_' + currentId + '_title_container',
      class: 'task-title-container'
    });
    var $titleInput = $('<input>', {
      id: 'task_' + currentId + '_title_input',
      type: 'text',
      class: 'task-title-input',
      placeholder: 'Название задачи...'
    });
    var $addTrackerBtn = $('<button>', {
      type: 'button',
      class: 'task-add-tracker'
    }).text('Добавить трекер');
    var $saveTitleBtn = $('<button>', {
      id: 'task_' + currentId + '_save_title',
      type: 'button',
      class: 'task-save-title'
    }).text('Сохранить');
    var $titleStatic = $('<span>', {
      id: 'task_' + currentId + '_title_static',
      class: 'task-title-static',
      style: 'display:none;'
    });
    $titleContainer.append($titleInput)
                   .append($addTrackerBtn)
                   .append($saveTitleBtn)
                   .append($titleStatic);
    
    // Панель действий: выбор состояния и кнопка удаления
    var $actions = $('<div>', {
      id: 'task_' + currentId + '_actions',
      class: 'task-actions'
    });
    var $stateSelect = $('<select>', {
      id: 'task_' + currentId + '_state',
      class: 'task-state'
    });
    $stateSelect.append('<option value="pending" selected>В ожидании</option>');
    $stateSelect.append('<option value="in-progress">В процессе</option>');
    $stateSelect.append('<option value="completed">Выполнено</option>');
    $stateSelect.append('<option value="failed">Провалено</option>');
    $stateSelect.append('<option value="cancelled">Отменено</option>');
    var $deleteButton = $('<button>', {
      id: 'task_' + currentId + '_delete',
      class: 'task-delete'
    }).text('Удалить');
    $actions.append($stateSelect).append($deleteButton);
    
    $details.append($titleContainer).append($actions);
    
    // Собираем задачу: точка таймлайна + детали
    $task.append($dot).append($details);
    
    return $task;
  }
  
  // Функция для отображения UI выбора трекеров с выделением выбранных вне input
  function showTrackerUI($task) {
    var $trackerUI = $task.find('.tracker-ui');
    if ($trackerUI.length > 0) {
      // Если UI уже существует – обновляем контейнер выбранных, если ранее были сохранены трекеры
      var trackers = $task.data('trackers') || [];
      var $selectedContainer = $trackerUI.find('.selected-trackers');
      $selectedContainer.empty();
      trackers.forEach(function(tracker) {
        var $selectedItem = $('<div class="tracker-selected-item" style="display:inline-block; margin:2px; padding:2px 5px; border-radius:3px; font-weight:bold; cursor:pointer;">' + tracker.first_name + '</div>');
        $selectedItem.data('user', tracker);
        $selectedContainer.append($selectedItem);
      });
      $trackerUI.show();
      return;
    }
    // Создаём новый UI для выбора трекеров
    $trackerUI = $(`
      <div class="tracker-ui" style="border:1px solid #ccc; padding:10px; margin-top:10px;">
        <input type="text" class="tracker-search" placeholder="Поиск пользователя..." style="width:80%;">
        <div class="tracker-results" style="margin-top:5px;"></div>
        <div class="selected-trackers" style="margin-top:5px;"></div>
        <button type="button" class="tracker-save" style="margin-top:5px;">Сохранить трекеры</button>
        <button type="button" class="tracker-cancel" style="margin-top:5px;">Отмена</button>
      </div>
    `);
    $task.find('.task-details').append($trackerUI);
  }
  
  // Функция для поиска трекеров через AJAX (/telegram_treker)
  function searchTrackers(query, callback) {
    $.get('/telegram_treker', { q: query }, function(data) {
      if (data.success) {
        callback(data.users);
      } else {
        callback([]);
      }
    });
  }
  
  // Функция для отправки уведомления о смене статуса задачи
  function sendTaskNotification($task, newState) {
    var projectName = window.currentProject || "Неизвестный проект";
    var taskName = $task.find('.task-title-static').text().trim() || "Без названия";
    var chatIds = [];
    var trackers = $task.data('trackers') || [];
    trackers.forEach(function(tracker) {
      chatIds.push(tracker.chat_id);
    });
    if (chatIds.length === 0) {
      return;
    }
    var messageText = "В проекте *" + projectName + "* задача *" + taskName + "* имеет статус: *" + newState + "*.";
    var formData = new FormData();
    formData.append('project_name', projectName);
    formData.append('task_name', taskName);
    formData.append('task_status', newState);
    chatIds.forEach(function(id) {
      formData.append('chat_ids', id);
    });
    $.ajax({
      url: '/telegram_task_notify',
      type: 'POST',
      data: formData,
      processData: false,
      contentType: false,
      success: function(response) {
        if (response.success) {
          console.log("Уведомления отправлены:", response.results);
        } else {
          alert("Ошибка отправки уведомления: " + response.error);
        }
      },
      error: function(xhr, status, error) {
        console.error("Ошибка AJAX запроса:", error);
      }
    });
  }
  
  // Обработчик клика по кнопке "Задача" для создания новой задачи
  $('#task').click(function() {
    var sel = window.getSelection();
    var $currentContainer = null;
    if (sel.rangeCount) {
      var node = sel.getRangeAt(0).startContainer;
      $currentContainer = $(node).closest('.task-list');
    }
    if (!$currentContainer || $currentContainer.length === 0) {
      $currentContainer = createTaskContainer();
    }
    var $newTask = createNewTask();
    $currentContainer.append($newTask);
    $newTask.find('.task-title-input').focus();
  });
  
  // Редактирование названия задачи по двойному клику
  $(document).on('dblclick', '.task-title-static', function() {
    var $taskTitle = $(this);
    var $titleContainer = $taskTitle.closest('.task-title-container');
    var $input = $titleContainer.find('.task-title-input');
    var $saveButton = $titleContainer.find('.task-save-title');
    $titleContainer.find('.task-add-tracker').show();
    $input.val($taskTitle.text()).show().focus();
    $saveButton.show();
    $taskTitle.hide();
  });
  
  // Сохранение названия задачи – скрываем кнопку "Добавить трекер"
  $(document).on('click', '.task-save-title', function(e) {
    e.stopPropagation();
    var $btn = $(this);
    var $titleContainer = $btn.closest('.task-title-container');
    var $input = $titleContainer.find('.task-title-input');
    var $static = $titleContainer.find('.task-title-static');
    var titleText = $input.val().trim();
    if (titleText.length === 0) {
      alert("Название не может быть пустым");
      return;
    }
    $static.text(titleText).show();
    $input.hide();
    $btn.hide();
    $titleContainer.find('.task-add-tracker').hide();
  });
  
  // Обработчик нажатия на кнопку "Добавить трекер" в заголовке задачи
  $(document).on('click', '.task-add-tracker', function(e) {
    e.stopPropagation();
    var $task = $(this).closest('.task');
    showTrackerUI($task);
  });
  
  // Изменение статуса задачи (отправка уведомления, если выбраны трекеры)
  $(document).on('change', '.task-state', function() {
    var newState = $(this).val();
    var $task = $(this).closest('.task');
    $task.attr('data-state', newState);
    $task.removeClass('pending in-progress completed failed cancelled').addClass(newState);
    var stateTextMap = {
      "pending": "В ожидании",
      "in-progress": "В процессе",
      "completed": "Выполнено",
      "failed": "Провалено",
      "cancelled": "Отменено"
    };
    $task.find('.dot-state-label').text(stateTextMap[newState]);
    var $container = $task.closest('.task-list');
    if ($container.find('.task.failed').length > 0) {
      $container.addClass('has-failed');
    } else {
      $container.removeClass('has-failed');
    }
    sendTaskNotification($task, stateTextMap[newState]);
  });
  
  // Удаление задачи
  $(document).on('click', '.task-delete', function() {
    var $task = $(this).closest('.task');
    var $container = $task.closest('.task-list');
    $task.slideUp(300, function() {
      $(this).remove();
      if ($container.find('.task').length === 0) {
        $container.slideUp(300, function() {
          $(this).remove();
        });
      }
    });
  });
  
  // --- Обработчики для UI трекера ---
  
  // Поиск трекеров при вводе в поле поиска – заполняем блок результатов
  $(document).on('keyup', '.tracker-search', function() {
    var $input = $(this);
    var query = $input.val().trim();
    var $resultsContainer = $input.siblings('.tracker-results');
    if (query.length < 2) {
      $resultsContainer.empty();
      return;
    }
    searchTrackers(query, function(users) {
      $resultsContainer.empty();
      if (users.length > 0) {
        users.forEach(function(user) {
          var $userBtn = $('<button type="button" class="tracker-result-item" style="margin:2px;">' + user.first_name + '</button>');
          $userBtn.data('user', user);
          $resultsContainer.append($userBtn);
        });
      } else {
        $resultsContainer.append('<div>Ничего не найдено</div>');
      }
    });
  });
  
  // При клике на результат поиска – добавляем трекер в контейнер выбранных (если его там ещё нет)
  $(document).on('click', '.tracker-result-item', function() {
    var user = $(this).data('user');
    var $trackerUI = $(this).closest('.tracker-ui');
    var $selectedContainer = $trackerUI.find('.selected-trackers');
    // Проверяем, нет ли уже данного пользователя в выбранных
    var exists = false;
    $selectedContainer.find('.tracker-selected-item').each(function() {
      var existingUser = $(this).data('user');
      if (existingUser.chat_id === user.chat_id) {
        exists = true;
        return false;
      }
    });
    if (exists) return;
    var $selectedItem = $('<div class="tracker-selected-item" style="display:inline-block; margin:2px; padding:2px 5px; border-radius:3px; font-weight:bold; cursor:pointer;">' + user.first_name + '</div>');
    $selectedItem.data('user', user);
    $selectedContainer.append($selectedItem);
  });
  
  // При клике на выбранного трекера – он удаляется из списка
  $(document).on('click', '.tracker-selected-item', function() {
    $(this).remove();
  });
  
  // Сохранение выбранных трекеров – при нажатии кнопки "Сохранить трекеры"
  $(document).on('click', '.tracker-save', function() {
    var $trackerUI = $(this).closest('.tracker-ui');
    var trackers = [];
    $trackerUI.find('.tracker-selected-item').each(function() {
      var user = $(this).data('user');
      trackers.push(user);
    });
    var $task = $(this).closest('.task');
    $task.data('trackers', trackers);
    // Скрываем кнопку "Добавить трекер" в заголовке задачи и закрываем UI выбора
    $task.find('.task-add-tracker').hide();
    $trackerUI.remove();
  });
  
  // Отмена выбора трекера – закрываем UI выбора трекеров
  $(document).on('click', '.tracker-cancel', function() {
    $(this).closest('.tracker-ui').remove();
  });
});
