$(document).ready(function() {

  // Функция для создания и вставки контейнера в DOM
  function createTelegramContainer() {
    var container = $(` 
      <div id="unique-telegram-message-container" class="unique-tele-message-container">
        <h3 id="unique-telegram-message-header" class="unique-tele-message-header">Отправка сообщения в Telegram</h3>
        <form id="unique-telegram-message-form" class="unique-tele-message-form">
          <!-- Текст сообщения -->
          <div class="form-group unique-tele-message-text-group">
            <label for="unique-message-text" id="unique-message-text-label" class="unique-tele-message-text-label">Текст сообщения:</label>
            <textarea id="unique-message-text" class="unique-tele-message-textarea" rows="3" placeholder="Введите текст сообщения"></textarea>
          </div>
          <!-- Поиск и выбор получателей -->
          <div class="form-group unique-tele-recipient-search-group">
            <label for="unique-recipient-search" id="unique-recipient-search-label" class="unique-tele-recipient-search-label">Поиск пользователя:</label>
            <input type="text" id="unique-recipient-search" class="unique-tele-recipient-search" placeholder="Введите имя пользователя">
            <!-- Результаты поиска -->
            <div id="unique-recipient-results" class="unique-tele-recipient-results" style="max-height: 150px; overflow-y: auto; margin-top: 5px;"></div>
            <!-- Список выбранных получателей -->
            <div id="unique-selected-recipients" class="unique-tele-selected-recipients" style="margin-top: 10px;"></div>
          </div>
          <!-- Загрузка файла -->
          <div class="form-group unique-tele-media-upload-group">
            <label for="unique-media-upload" id="unique-media-upload-label" class="unique-tele-media-upload-label">Загрузить фото:</label>
            <input type="file" id="unique-media-upload" name="media" accept="image/*" class="unique-tele-media-upload">
          </div>
          <!-- Кнопки отправки и отмены -->
          <button type="submit" id="unique-submit-button" class="unique-tele-messages-button btn btn-primary">Отправить</button>
          <button type="button" id="unique-close-telegram-message" class="unique-tele-close-button btn btn-secondary">Отмена</button>
        </form>
      </div>
    `);
    $('body').append(container);
    $('#unique-telegram-message-container').show();
  }

  // Обработчик клика по кнопке "Сообщение"
  $('#unique-telegram-massages').on('click', function() {
    if ($('#unique-telegram-message-container').length === 0) {
      createTelegramContainer();
    } else {
      $('#unique-telegram-message-container').show();
    }
  });

  // Закрытие контейнера по нажатию кнопки "Отмена"
  $(document).on('click', '#unique-close-telegram-message', function() {
    $('#unique-telegram-message-container').hide();
  });

  // Обработка поиска пользователей
  $(document).on('keyup', '#unique-recipient-search', function() {
    var query = $(this).val().trim();
    if (query.length > 0) {
      $.ajax({
        url: '/telegram_treker',
        method: 'GET',
        data: { q: query },
        success: function(response) {
          var resultsDiv = $('#unique-recipient-results');
          resultsDiv.empty();
          if (response.success && response.users && response.users.length > 0) {
            response.users.forEach(function(user) {
              var userEl = $('<div></div>')
                .text(user.first_name + ' (' + user.chat_id + ')')
                .css({ 'cursor': 'pointer', 'padding': '5px', 'border-bottom': '1px solid #eee' })
                .attr('data-chat-id', user.chat_id);
              resultsDiv.append(userEl);
            });
          } else {
            resultsDiv.html('<em>Нет результатов</em>');
          }
        },
        error: function() {
          $('#unique-recipient-results').html('<em>Ошибка при поиске пользователей</em>');
        }
      });
    } else {
      $('#unique-recipient-results').empty(); // Очищаем результаты, если поле ввода пустое
    }
  });

  // Обработчик клика на результатах поиска
  $(document).on('click', '#unique-recipient-results div', function() {
    var chatId = $(this).attr('data-chat-id');
    var exists = false;
    $('#unique-selected-recipients span').each(function() {
      if ($(this).data('chat-id') == chatId) {
        exists = true;
      }
    });
    if (!exists) {
      var tag = $('<span></span>')
        .text($(this).text())
        .css({
          'display': 'inline-block',
          'padding': '5px 10px',
          'margin': '5px',
          'border-radius': '15px',
          'cursor': 'pointer'
        })
        .attr('data-chat-id', chatId)
        .attr('title', 'Нажмите, чтобы удалить');
      tag.on('click', function() {
        $(this).remove();
      });
      $('#unique-selected-recipients').append(tag);
    }
  });

  // Обработка отправки формы
  $(document).on('submit', '#unique-telegram-message-form', function(e) {
    e.preventDefault();

    var messageText = $('#unique-message-text').val().trim();
    if (messageText === '') {
      alert('Введите текст сообщения');
      return;
    }

    var chatIds = [];
    $('#unique-selected-recipients span').each(function() {
      chatIds.push($(this).data('chat-id'));
    });
    if (chatIds.length === 0) {
      alert('Выберите хотя бы одного получателя');
      return;
    }

    var fileInput = $('#unique-media-upload')[0];
    var fileSelected = fileInput.files.length > 0 ? fileInput.files[0] : null;

    // Если выбран файл
    if (fileSelected) {
      var uploadCount = 0;
      var errorOccurred = false;
      chatIds.forEach(function(chatId) {
        var formData = new FormData();
        formData.append('chat_ids', chatId);
        formData.append('media', fileSelected);
        formData.append('message_text', messageText);

        $.ajax({
          url: '/telegram_send',
          method: 'POST',
          data: formData,
          processData: false,
          contentType: false,
          success: function(response) {
            if (!response.success) {
              alert('Ошибка для chat_id ' + chatId + ': ' + response.error);
              errorOccurred = true;
            }
          },
          error: function() {
            alert('Ошибка при отправке для chat_id ' + chatId);
            errorOccurred = true;
          },
          complete: function() {
            uploadCount++;
            if (uploadCount === chatIds.length) {
              if (!errorOccurred) {
                alert('Сообщения отправлены');
                $('#unique-telegram-message-form')[0].reset();
                $('#unique-selected-recipients').empty();
                $('#unique-recipient-results').empty();
                $('#unique-telegram-message-container').hide();
              }
            }
          }
        });
      });
    } else {
      var formData = new FormData();
      chatIds.forEach(function(chatId) {
        formData.append('chat_ids', chatId);
      });
      formData.append('message_text', messageText);

      $.ajax({
        url: '/telegram_send',
        method: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function(response) {
          if (response.success) {
            alert('Сообщения отправлены');
            $('#unique-telegram-message-form')[0].reset();
            $('#unique-selected-recipients').empty();
            $('#unique-recipient-results').empty();
            $('#unique-telegram-message-container').hide();
          } else {
            alert('Ошибка: ' + response.error);
          }
        },
        error: function() {
          alert('Ошибка при отправке запроса');
        }
      });
    }
  });
});
