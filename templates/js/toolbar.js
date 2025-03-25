$(document).ready(function(){
  // Заполняем выпадающий список размеров шрифта от 8 до 150
  var $fontSizeSelect = $('#font-size');
  for (var i = 8; i <= 150; i++) {
    $fontSizeSelect.append($('<option>', {
      value: i,
      text: i
    }));
  }

  $('#text-align').change(function(){
    var align = $(this).val();
    if (align === 'left') {
      document.execCommand("justifyLeft", false, null);
    } else if (align === 'center') {
      document.execCommand("justifyCenter", false, null);
    } else if (align === 'right') {
      document.execCommand("justifyRight", false, null);
    }
  });

  // Форматирование текста (жирный, курсив, подчёркивание)
  $('.format-btn').click(function(){
    var command = $(this).data('command');
    document.execCommand(command, false, null);
  });

  // Изменение шрифта
  $('#font-family').change(function(){
    var font = $(this).val();
    document.execCommand("fontName", false, font);
  });

  // Изменение размера шрифта через выпадающий список
  $('#font-size').change(function(){
    var size = $(this).val();
    var sel = window.getSelection();

    if (sel.rangeCount) {
      var range = sel.getRangeAt(0);
      // Создаем span с заданным размером шрифта
      var span = document.createElement('span');
      span.style.fontSize = size + 'px';

      // Если выделение сложно обернуть (например, содержит несколько узлов), вставляем HTML
      try {
        range.surroundContents(span);
      } catch (e) {
        var selectedText = sel.toString();
        if (selectedText) {
          var html = "<span style='font-size:" + size + "px;'>" + selectedText + "</span>";
          document.execCommand("insertHTML", false, html);
        }
      }

      // Восстанавливаем выделение
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  // Изменение цвета шрифта
  $('#font-color').change(function(){
    var color = $(this).val();
    document.execCommand("foreColor", false, color);
  });

// Вставка ссылки
function insertLink() {
  var url = prompt("Введите URL ссылки:");
  if (url) {
    document.execCommand("createLink", false, url);
  }
}

$('#link-btn').click(function(){
  insertLink();
});

$(document).keydown(function(e) {
  if (e.ctrlKey && e.which === 73) { // Ctrl + I
    e.preventDefault();
    insertLink();
  }
});



  // Добавление цитаты
  $('#quote-btn').click(function(){
    document.execCommand("formatBlock", false, "blockquote");
  });

  // --- ВСТАВКА КОДОВОГО БЛОКА ---
  $('#clickable-text-btn').click(function(){
    var sel = window.getSelection();
    var selectedText = sel.toString();
    if(selectedText){
      var html = '<div class="clickable-text">' +
                   '<div class="copy-container" contenteditable="false">' +
                     '<button class="copy-icon" contenteditable="false">Скопировать 📋</button>' +
                   '</div>' +
                   '<pre class="code-content" contenteditable="true"><code>' + selectedText + '</code></pre>' +
                 '</div>';
      document.execCommand("insertHTML", false, html);
    }
  });

  // Обработчик клика по кнопке копирования внутри код-блока
  $(document).on('click', '.clickable-text .copy-icon', function(e){
    e.stopPropagation();
    // Находим текст внутри <code> в ближайшем контейнере код-блока
    var codeText = $(this).closest('.clickable-text').find('.code-content code').text();
    navigator.clipboard.writeText(codeText).then(function(){
      alert("Код скопирован:\n" + codeText);
    });
  });

  // --- ОБНОВЛЕНИЕ ПАНЕЛИ ИНСТРУМЕНТОВ ---
  function updateToolbarState(){
    var sel = window.getSelection();
    if (sel.rangeCount) {
      var range = sel.getRangeAt(0);
      var node = range.startContainer;
      if(node.nodeType === 3) node = node.parentNode;
      var fontSize = window.getComputedStyle(node, null).getPropertyValue('font-size');
      if (fontSize){
        var size = parseInt(fontSize, 10);
        $('#font-size').val(size);
      }
      // При желании можно добавить и обновление выравнивания:
      // var textAlign = window.getComputedStyle(node, null).getPropertyValue('text-align');
      // if(textAlign){
      //   // Приводим к значению left/center/right для нашего селекта
      //   if(textAlign === 'start' || textAlign === 'left'){
      //     $('#text-align').val('left');
      //   } else if(textAlign === 'center'){
      //     $('#text-align').val('center');
      //   } else if(textAlign === 'end' || textAlign === 'right'){
      //     $('#text-align').val('right');
      //   }
      // }
    }
  }
  $('#editor').on('keyup mouseup', updateToolbarState);
});

  // --- Кнопка нового абзаца ---
  $('#insert-empty-para-btn').click(function(){
    var editor = document.getElementById('editor');
    // Создаем пустой абзац
    var newPara = document.createElement('p');
    newPara.innerHTML = '<br>';
    editor.appendChild(newPara);
    // Перемещаем курсор в созданный абзац
    newPara.scrollIntoView();
    var range = document.createRange();
    range.selectNodeContents(newPara);
    range.collapse(true);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
  });

  // --- Логика сброса стилей при двойном нажатии Enter ---
  // После двух подряд нажатых Enter'ов мы вставляем новый абзац без дополнительных стилей
  var enterCounter = 0;
  $('#editor').on('keydown', function(e){
    if(e.key === "Enter"){
      enterCounter++;
      if(enterCounter >= 2){
        // Отменяем стандартное действие второго Enter'а
        e.preventDefault();
        // Создаем новый абзац с пустым содержимым
        var newPara = document.createElement('p');
        newPara.innerHTML = '<br>';
        // Вставляем его в конец редактора
        var editor = document.getElementById('editor');
        editor.appendChild(newPara);
        // Перемещаем курсор в новый абзац
        var range = document.createRange();
        range.selectNodeContents(newPara);
        range.collapse(true);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        enterCounter = 0;
        return false;
      }
    } else {
      enterCounter = 0;
    }
  });

$(document).on('click', '#editor a', function(e) {
    e.preventDefault();
    
    var $link = $(this);
    var href = $link.attr('href');

    // Если уже открыт попап на той же ссылке — не перерисовываем
    if ($('#link-popup').length && $('#link-popup').data('href') === href) {
        return;
    }

    // Удаляем старый попап
    $('#link-popup').remove();

    // Создаем попап
    var $popup = $('<div id="link-popup" style="position:absolute; background:#fff; border:1px solid #ccc; padding:5px; z-index:10000; box-shadow: 0 0 5px rgba(0,0,0,0.2);"></div>');
    $popup.append(`<span>Ссылка: </span>`);
    var $gotoButton = $('<button type="button" style="margin-left:5px;">Перейти</button>');
    
    $gotoButton.on('click', function() {
        window.open(href, '_blank');
    });

    $popup.append($gotoButton);
    $('body').append($popup);

    // Сохраняем ссылку в data
    $popup.data('href', href);

    // Координаты ссылки
    var offset = $link.offset();
    var linkWidth = $link.outerWidth();
    var linkHeight = $link.outerHeight();
    var popupWidth = $popup.outerWidth();
    var popupHeight = $popup.outerHeight();

    // Определяем положение попапа с учетом границ окна
    var topPos = offset.top - popupHeight - 5; // Над ссылкой
    var leftPos = offset.left + linkWidth / 2 - popupWidth / 2; // Центрируем относительно ссылки

    // Если попап выходит за границы сверху — ставим его снизу
    if (topPos < $(window).scrollTop()) {
        topPos = offset.top + linkHeight + 5;
    }

    // Если попап выходит за границы слева
    if (leftPos < 0) {
        leftPos = 5;
    }

    // Если попап выходит за границы справа
    if (leftPos + popupWidth > $(window).width()) {
        leftPos = $(window).width() - popupWidth - 5;
    }

    $popup.css({ top: topPos, left: leftPos });

    // Закрываем попап, если клик вне него и вне ссылки
    $(document).on('click.linkPopup', function(event) {
        if (!$(event.target).closest('#link-popup, #editor a').length) {
            $('#link-popup').remove();
            $(document).off('click.linkPopup');
        }
    });
});




  document.getElementById('chat').addEventListener('click', function() {
    // Открываем новое окно с чатом
    window.open('/chat', 'chatWindow', 'width=650,height=500');
});

  document.getElementById('telegram').addEventListener('click', function() {
  window.open(
    '/telegram', // Замените URL на нужный
    'TelegramWindow',
    'toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=1000,height=700'
  );
});