(function($) {
  $(document).ready(function() {
    /**
     * Обработчик для кнопки "Открыть" внутри редактора.
     * При клике формируется URL для скачивания файла и запускается скачивание.
     */
    $('#editor').on('click', '.open-file-btn', function() {
      // Получаем имя файла из data-атрибута родительского контейнера
      var container = $(this).closest('.file-container');
      var filename = container.attr('data-filename');
      
      // Формируем URL для скачивания файла, передавая project_name и file_name как GET-параметры
      var downloadUrl = '/download_file?project_name=' 
                        + encodeURIComponent(window.currentProject)
                        + '&file_name=' + encodeURIComponent(filename);
      
      // Создаем временную ссылку и инициируем по ней клик для скачивания файла
      var link = document.createElement('a');
      link.href = downloadUrl;
      // Атрибут download помогает задать имя файла (браузер может игнорировать его, если сервер выставит Content-Disposition)
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    /**
     * Функция для загрузки файла, создающая контейнер в редакторе.
     * Используется ТОЛЬКО при прикреплении файла через кнопку #filepath.
     */
    function uploadFileAttachment(formData) {
      var progressBar = $('#upload-progress .progress-bar');
      $('#upload-progress').show();
      
      $.ajax({
        xhr: function() {
          var xhr = new window.XMLHttpRequest();
          xhr.upload.addEventListener("progress", function(evt) {
            if (evt.lengthComputable) {
              var percentComplete = (evt.loaded / evt.total) * 100;
              progressBar.css('width', percentComplete + '%');
            }
          }, false);
          return xhr;
        },
        url: '/upload_file',
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function(data) {
          $('#upload-progress').fadeOut(500, function(){ progressBar.css('width', '0%'); });
          if (data.success) {
            // Создаем контейнер для прикрепленного файла
            var container = $('<div class="file-container" contenteditable="false"></div>');
            // Записываем имя файла в data-атрибут для последующего использования при скачивании
            container.attr('data-filename', data.filename);
            
            // Иконка файла (универсальная, можно заменить путь при необходимости)
            var icon = $('<img class="file-icon">').attr('src', 'js/file.png');
            container.append(icon);
            
            // Название файла
            var fileNameSpan = $('<span class="file-name"></span>').text(data.filename);
            container.append(fileNameSpan);
            
            // Кнопка "Открыть"
            var openButton = $('<button class="open-file-btn">Скачать</button>');
            container.append(openButton);
            
            // Добавляем контейнер в редактор
            $('#editor').append(container);
          } else {
            alert("Ошибка загрузки файла: " + data.error);
          }
        },
        error: function(err) {
          $('#upload-progress').fadeOut(500, function(){ progressBar.css('width', '0%'); });
          alert("Ошибка запроса: " + err.responseText);
        }
      });
    }

    /**
     * Обработчик для кнопки "Прикрепить файл".
     * Создает временный input для выбора файлов и вызывает uploadFileAttachment для каждого выбранного файла.
     */
    $('#filepath').on('click', function() {
      // Создаем временный input для выбора файлов
      var fileInput = $('<input type="file" style="display: none;">');
      fileInput.attr('multiple', 'multiple');
      $('body').append(fileInput);
      
      fileInput.on('change', function(e) {
        // Проверяем, выбран ли проект
        if (!window.currentProject) {
          alert("Выберите проект");
          fileInput.remove();
          return;
        }
        
        var files = e.target.files;
        Array.from(files).forEach(function(file) {
          var formData = new FormData();
          formData.append('project_name', window.currentProject);
          formData.append('file', file);
          // Загружаем файл и создаем контейнер в редакторе при успехе
          uploadFileAttachment(formData);
        });
        fileInput.remove();
      });
      
      // Программно запускаем диалог выбора файлов
      fileInput.trigger('click');
    });

  });
})(jQuery);
