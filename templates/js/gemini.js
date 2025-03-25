$(document).ready(function() {
  // Функция для экранирования HTML (безопасный вывод пользовательского текста)
  function escapeHtml(text) {
    return $('<div>').text(text).html();
  }

  // Преобразование простого markdown-подобного форматирования в HTML.
  function formatGeminiResponse(text) {
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    var paragraphs = text.split(/\n\s*\n/);
    for (var i = 0; i < paragraphs.length; i++) {
      paragraphs[i] = '<p>' + paragraphs[i].replace(/\n/g, '<br>') + '</p>';
    }
    return paragraphs.join('');
  }

  // Создаёт контейнер для диалога Gemini с областью для до-запроса.
  function createGeminiContainer() {
    var container = document.createElement('div');
    container.className = 'gemini-container';
    container.setAttribute('contenteditable', 'false');

    var answerDiv = document.createElement('div');
    answerDiv.className = 'gemini-answer';
    answerDiv.setAttribute('contenteditable', 'false');
    container.appendChild(answerDiv);

    var followupDiv = document.createElement('div');
    followupDiv.className = 'gemini-followup';
    followupDiv.setAttribute('contenteditable', 'false');

    var inputField = document.createElement('textarea');
    inputField.className = 'gemini-input';
    inputField.placeholder = 'Введите дополнительный запрос...';

    var sendButton = document.createElement('button');
    sendButton.className = 'gemini-send';
    sendButton.innerText = 'Отправить';
    sendButton.setAttribute('contenteditable', 'false');

    followupDiv.appendChild(inputField);
    followupDiv.appendChild(sendButton);
    container.appendChild(followupDiv);

    return container;
  }

  // Функция для обработки первоначального запроса (при нажатии на кнопку или горячую клавишу).
  function processGeminiInitial() {
    var sel = window.getSelection();
    var selectedText = sel.toString().trim();
    if (!selectedText) {
      alert("Пожалуйста, выделите текст перед использованием Gemini.");
      return;
    }
    if (sel.rangeCount === 0) return;
    var range = sel.getRangeAt(0);

    var newContainer = createGeminiContainer();
    var existingContainer = $(range.startContainer).closest('.gemini-container');
    if (existingContainer.length > 0) {
      existingContainer.after(newContainer);
    } else {
      range.collapse(false);
      range.insertNode(newContainer);
    }

    sel.removeAllRanges();
    var newRange = document.createRange();
    newRange.setStartAfter(newContainer);
    sel.addRange(newRange);

    var $answerDiv = $(newContainer).find('.gemini-answer');
    $answerDiv.empty();
    $answerDiv.append('<p class="gemini-question">' + escapeHtml(selectedText) + '</p>');
    var waitingMessage = $('<p class="gemini-waiting">Подождите, ответ от Gemini</p>');
    $answerDiv.append(waitingMessage);

    $.ajax({
      url: '/gemini_api',
      type: 'POST',
      data: { text: selectedText },
      success: function(response) {
        waitingMessage.remove();
        if (response.success) {
          var formatted = formatGeminiResponse(response.response);
          $answerDiv.append('<div class="gemini-answer-item">' + formatted + '</div>');
        } else {
          $answerDiv.append('<p class="gemini-error">Ошибка Gemini: ' + response.error + '</p>');
        }
      },
      error: function(xhr, status, error) {
        waitingMessage.remove();
        $answerDiv.append('<p class="gemini-error">Ошибка при обращении к серверу: ' + error + '</p>');
      }
    });

    observeContainerRemoval(newContainer);
  }

  // Функция для обработки до-запроса в уже существующем контейнере.
  function processFollowupQuery(container) {
    var inputField = $(container).find('.gemini-input');
    var query = inputField.val().trim();
    if (!query) return;

    inputField.prop('disabled', true);
    $(container).find('.gemini-send').prop('disabled', true);

    var $answerDiv = $(container).find('.gemini-answer');
    $answerDiv.append('<p class="gemini-question">' + escapeHtml(query) + '</p>');
    var waitingMessage = $('<p class="gemini-waiting">Подождите, ответ от Gemini</p>');
    $answerDiv.append(waitingMessage);

    var contextClone = $answerDiv.clone();
    contextClone.find('.gemini-waiting').remove();
    var previousContext = contextClone.text();
    var combinedMessage = query + "\n\nПРОШЛЫЙ КОНТЕКСТ:\n" + previousContext;

    $.ajax({
      url: '/gemini_api',
      type: 'POST',
      data: { text: combinedMessage },
      success: function(response) {
        waitingMessage.remove();
        if (response.success) {
          var formatted = formatGeminiResponse(response.response);
          $answerDiv.append('<div class="gemini-answer-item">' + formatted + '</div>');
        } else {
          $answerDiv.append('<p class="gemini-error">Ошибка Gemini: ' + response.error + '</p>');
        }
      },
      error: function(xhr, status, error) {
        waitingMessage.remove();
        $answerDiv.append('<p class="gemini-error">Ошибка при обращении к серверу: ' + error + '</p>');
      },
      complete: function() {
        inputField.prop('disabled', false);
        $(container).find('.gemini-send').prop('disabled', false);
        inputField.val('');
      }
    });
  }

  // Удаление контейнера, если блок ответа пустой.
  function observeContainerRemoval(container) {
    var target = $(container).find('.gemini-answer')[0];
    var observer = new MutationObserver(function(mutations) {
      if ($(target).text().trim() === '') {
        $(container).remove();
        observer.disconnect();
      }
    });
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }

  // -------------------------------
  // Новая функциональность: Контекстное меню для выделенного текста
  // -------------------------------
  var selectedGeminiText = "";
  var selectedGeminiRange = null;

  // Создание или получение существующего контекстного меню с префиксом gemini
  function getOrCreateGeminiContextMenu() {
    var $menu = $('#gemini-context-menu');
    if ($menu.length === 0) {
      $menu = $('<div id="gemini-context-menu" class="gemini-context-menu"></div>');
      var normalBtn = $('<button id="gemini-context-normal" class="gemini-context-normal">Обычный запрос</button>');
      var addAssistantBtn = $('<button id="gemini-context-add-assistant" class="gemini-context-add-assistant">Добавить ассистента</button>');
      var assistantsList = $('<div id="gemini-context-assistants-list" class="gemini-context-assistants-list"></div>');
      $menu.append(normalBtn).append(addAssistantBtn).append(assistantsList);
      $('body').append($menu);
    }
    return $menu;
  }

  // Обновление списка ассистентов из localStorage
  function updateAssistantList() {
    var $list = $('#gemini-context-assistants-list');
    $list.empty();
    var assistants = JSON.parse(localStorage.getItem('gemini_assistants') || '[]');
    assistants.forEach(function(assistant, index) {
      var $item = $('<div class="gemini-context-assistant-item"></div>');
      var $name = $('<span class="gemini-assistant-name">' + escapeHtml(assistant.name) + '</span>');
      var $edit = $('<button class="gemini-assistant-edit">Изменить</button>');
      var $delete = $('<button class="gemini-assistant-delete">Удалить</button>');
      $item.append($name).append($edit).append($delete);
      // При клике по имени ассистента – отправка запроса с комбинированным текстом:
      // assistant.prompt + перевод строки + выделенный текст
      $name.click(function(e) {
        e.stopPropagation();
        hideContextMenu();
        processGeminiQuery(selectedGeminiText, assistant.prompt);
      });
      // Редактирование ассистента
      $edit.click(function(e) {
        e.stopPropagation();
        var newName = prompt("Новое имя ассистента:", assistant.name);
        if (newName === null) return;
        var newPrompt = prompt("Новый prompt для ассистента:", assistant.prompt);
        if (newPrompt === null) return;
        assistants[index] = { name: newName, prompt: newPrompt };
        localStorage.setItem('gemini_assistants', JSON.stringify(assistants));
        updateAssistantList();
      });
      // Удаление ассистента
      $delete.click(function(e) {
        e.stopPropagation();
        if (confirm("Удалить ассистента?")) {
          assistants.splice(index, 1);
          localStorage.setItem('gemini_assistants', JSON.stringify(assistants));
          updateAssistantList();
        }
      });
      $list.append($item);
    });
  }

  function hideContextMenu() {
    $('#gemini-context-menu').hide();
  }

  // Функция для обработки запроса (обычного или с ассистентом)
  function processGeminiQuery(queryText, assistantPrompt) {
    if (!queryText) {
      alert("Нет выделенного текста.");
      return;
    }
    var finalQuery = assistantPrompt ? assistantPrompt + "\n\n" + queryText : queryText;

    var newContainer = createGeminiContainer();
    if (selectedGeminiRange) {
      var range = selectedGeminiRange;
      range.collapse(false);
      range.insertNode(newContainer);
    } else {
      $('body').append(newContainer);
    }

    var $answerDiv = $(newContainer).find('.gemini-answer');
    $answerDiv.empty();
    $answerDiv.append('<p class="gemini-question">' + escapeHtml(queryText) + '</p>');
    var waitingMessage = $('<p class="gemini-waiting">Подождите, ответ от Gemini</p>');
    $answerDiv.append(waitingMessage);

    $.ajax({
      url: '/gemini_api',
      type: 'POST',
      data: { text: finalQuery },
      success: function(response) {
        waitingMessage.remove();
        if (response.success) {
          var formatted = formatGeminiResponse(response.response);
          $answerDiv.append('<div class="gemini-answer-item">' + formatted + '</div>');
        } else {
          $answerDiv.append('<p class="gemini-error">Ошибка Gemini: ' + response.error + '</p>');
        }
      },
      error: function(xhr, status, error) {
        waitingMessage.remove();
        $answerDiv.append('<p class="gemini-error">Ошибка при обращении к серверу: ' + error + '</p>');
      }
    });
    observeContainerRemoval(newContainer);
  }

  // Обработка события правого клика (contextmenu) для выделенного текста
  $(document).on('contextmenu', function(e) {
    var selection = window.getSelection();
    var text = selection.toString().trim();
    if (text) {
      e.preventDefault();
      selectedGeminiText = text;
      if (selection.rangeCount > 0) {
        selectedGeminiRange = selection.getRangeAt(0).cloneRange();
      } else {
        selectedGeminiRange = null;
      }
      var $menu = getOrCreateGeminiContextMenu();
      updateAssistantList();
      // Для позиционирования окна используем координаты мыши.
      // (Динамическое позиционирование – минимально необходимая логика, основной стиль задаётся в CSS)
      $menu.css({ top: e.pageY + 'px', left: e.pageX + 'px', position: 'absolute' }).show();
    } else {
      hideContextMenu();
    }
  });

  // Скрытие контекстного меню при клике вне его
  $(document).on('click', function(e) {
    if (!$(e.target).closest('#gemini-context-menu').length) {
      hideContextMenu();
    }
  });

  // Обработчик для кнопки "Обычный запрос" в контекстном меню
  $(document).on('click', '#gemini-context-normal', function(e) {
    e.stopPropagation();
    hideContextMenu();
    processGeminiQuery(selectedGeminiText, null);
  });

  // Обработчик для кнопки "Добавить ассистента"
  $(document).on('click', '#gemini-context-add-assistant', function(e) {
    e.stopPropagation();
    var name = prompt("Введите имя ассистента:");
    if (!name) return;
    var promptText = prompt("Введите prompt для ассистента:");
    if (promptText === null) return;
    var assistants = JSON.parse(localStorage.getItem('gemini_assistants') || '[]');
    assistants.push({ name: name, prompt: promptText });
    localStorage.setItem('gemini_assistants', JSON.stringify(assistants));
    updateAssistantList();
  });

  // -------------------------------
  // Существующие обработчики
  // -------------------------------
  $('#gemini').click(function() {
    processGeminiInitial();
  });

  $(document).keydown(function(e) {
    if (e.altKey && e.which === 65) { // Alt+A
      e.preventDefault();
      processGeminiInitial();
    }
  });

  $(document).on('click', '.gemini-send', function() {
    var container = $(this).closest('.gemini-container');
    processFollowupQuery(container);
  });

  $(document).on('keydown', '.gemini-input', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      var container = $(this).closest('.gemini-container');
      processFollowupQuery(container);
    }
  });
});
