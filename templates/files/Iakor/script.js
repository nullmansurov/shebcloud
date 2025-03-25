$(document).ready(function() {

  // Функция для показа всплывающих уведомлений (тосты)
  function showToast(message, duration) {
    duration = duration || 3000;
    var toast = $('<div class="toast-notification">' + message + '</div>');
    toast.css({
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'rgba(0, 0, 0, 0.7)',
      color: '#fff',
      padding: '10px 20px',
      borderRadius: '5px',
      zIndex: 9999,
      display: 'none'
    });
    $('body').append(toast);
    toast.fadeIn(400).delay(duration).fadeOut(400, function(){
         $(this).remove();
    });
  }

$(document).ready(function() {

  // Функция для показа всплывающих уведомлений (тосты)
  function showToast(message, duration) {
    duration = duration || 3000;
    var toast = $('<div class="toast-notification">' + message + '</div>');
    toast.css({
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'rgba(0, 0, 0, 0.7)',
      color: '#fff',
      padding: '10px 20px',
      borderRadius: '5px',
      zIndex: 9999,
      display: 'none'
    });
    $('body').append(toast);
    toast.fadeIn(400).delay(duration).fadeOut(400, function(){
         $(this).remove();
    });
  }

  // Обработчик кнопки для открытия модального окна с якорями
  $('#list-iakor').click(function() {
    // Очищаем список якорей в модальном окне
    $('#anchor-list-modal').empty();

    // Собираем все якоря в редакторе
    $('span.anchor-text').each(function() {
        var anchorId = $(this).attr('id');
        var anchorText = $(this).text();

        // Добавляем каждый якорь в список модального окна
        var anchorItem = $('<li></li>')
            .append('<a href="#" class="anchor-link" data-id="' + anchorId + '">' + anchorText + '</a>')
            .append('<button class="delete-anchor-btn" data-id="' + anchorId + '">удалить</button>');
        $('#anchor-list-modal').append(anchorItem);
    });

    // Показываем модальное окно
    $('#anchor-modal').modal('show');
  });

  // Обработчик добавления якоря
  $('#iakor').click(function() {
    var sel = window.getSelection();
    var selectedText = sel.toString();
    
    if (selectedText) {
        // Генерация уникального ID для якоря
        var anchorId = 'anchor-' + new Date().getTime();
        
        // Создаем новый элемент span с якорем
        var anchorElement = $('<span>', {
            id: anchorId,
            class: 'anchor-text',
            html: selectedText
        });

        // Вставляем элемент в редактор, сохраняя стили
        var range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(anchorElement[0]);

        // Добавляем якорь в список модального окна
        addAnchorToList(anchorId, selectedText);

        // Показываем уведомление, что якорь добавлен
        showToast('Якорь "' + selectedText + '" добавлен!', 3000);
    }
  });

  // Функция для добавления якоря в список модального окна
  function addAnchorToList(id, text) {
    var anchorList = $('#anchor-list-modal');
    var anchorItem = $('<li></li>')
        .append('<a href="#" class="anchor-link" data-id="' + id + '">' + text + '</a>')
        .append('<button class="delete-anchor-btn" data-id="' + id + '">Удалить</button>');
    anchorList.append(anchorItem);
  }

  // Плавный переход к якорю
  $(document).on('click', '.anchor-link', function(e) {
    e.preventDefault();
    var anchorId = $(this).data('id');
    var anchorElement = document.getElementById(anchorId);
    
    if (anchorElement) {
      anchorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Выделяем якорь визуально на 1 секунду
      $(anchorElement).css({ backgroundColor: '#ffff99' });
      setTimeout(() => {
        $(anchorElement).css({ backgroundColor: '' });
      }, 1000);
    }
  });

  // Обработчик удаления якоря (удаляет только обёртку, оставляя текст)
  $(document).on('click', '.delete-anchor-btn', function() {
    var anchorId = $(this).data('id');

    // Удаляем обёртку якоря, оставляя текст нетронутым
    $('#' + anchorId).contents().unwrap();

    // Удаляем якорь из списка модального окна
    $(this).parent().remove();

    // Показываем уведомление об удалении
    showToast('Якорь удален', 3000);
  });

  // Обработчик для кнопки закрытия модального окна с уникальным ID
  $('#anchor-modal-close').click(function() {
    $('#anchor-modal').modal('hide');
  });

  // Очищаем список якорей при закрытии модального окна
  $('#anchor-modal').on('hidden.bs.modal', function() {
    $('#anchor-list-modal').empty();
  });

  // Добавление горячих клавиш Ctrl + Y и Ctrl + U
  $(document).keydown(function(e) {
    if (e.ctrlKey) {
      if (e.which === 89) { // Ctrl + Y
        e.preventDefault();
        $('#list-iakor').click();
      }
      if (e.which === 85) { // Ctrl + U
        e.preventDefault();
        $('#iakor').click();
      }
    }
  });

});


  // Функция для добавления якоря в список модального окна
  function addAnchorToList(id, text) {
    var anchorList = $('#anchor-list-modal');
    var anchorItem = $('<li></li>')
        .append('<a href="#" class="anchor-link" data-id="' + id + '">' + text + '</a>')
        .append('<button class="delete-anchor-btn" data-id="' + id + '">Удалить</button>');
    anchorList.append(anchorItem);
  }

  // Плавный переход к якорю
  $(document).on('click', '.anchor-link', function(e) {
    e.preventDefault();
    var anchorId = $(this).data('id');
    var anchorElement = document.getElementById(anchorId);
    
    if (anchorElement) {
      anchorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Выделяем якорь визуально на 1 секунду
      $(anchorElement).css({ backgroundColor: '#ffff99' });
      setTimeout(() => {
        $(anchorElement).css({ backgroundColor: '' });
      }, 1000);
    }
  });

  // Обработчик удаления якоря (удаляет только обёртку, оставляя текст)
  $(document).on('click', '.delete-anchor-btn', function() {
    var anchorId = $(this).data('id');

    // Удаляем обёртку якоря, оставляя текст нетронутым
    $('#' + anchorId).contents().unwrap();

    // Удаляем якорь из списка модального окна
    $(this).parent().remove();

    // Показываем уведомление об удалении
    showToast('Якорь удален', 3000);
  });

  // Обработчик для кнопки закрытия модального окна с уникальным ID
  $('#anchor-modal-close').click(function() {
    $('#anchor-modal').modal('hide');
  });

  // Очищаем список якорей при закрытии модального окна
  $('#anchor-modal').on('hidden.bs.modal', function() {
    $('#anchor-list-modal').empty();
  });

  // Добавление горячих клавиш Shift + Q и Shift + W
  $(document).keydown(function(e) {
    if (e.shiftKey) {
      if (e.which === 81) { // Shift + Q
        e.preventDefault();
        $('#list-iakor').click();
      }
      if (e.which === 87) { // Shift + W
        e.preventDefault();
        $('#iakor').click();
      }
    }
  });

});
