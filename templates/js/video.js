$(document).ready(function() {

  // Если элемента прогресс-бара ещё нет, создаём его.
  if ($('#upload-progress').length === 0) {
    $('body').append(
      '<div id="upload-progress" style="display:none; width:300px; border: 1px solid #ccc; margin-top:10px;">' +
        '<div id="progress-bar" style="width:0%; height:20px; background:green;"></div>' +
      '</div>'
    );
  }

  /**
   * Создаёт внешний контейнер для плеера и инициализирует его с переданными видео.
   * @param {Array} videos - Массив объектов видео, например: 
   *   [ { title: "video1.mp4", file: "/workspace/Project/video1.mp4" }, ... ]
   */
  window.createExternalVideoPlayer = function(videos) {
    var $placeholder = $('#video-placeholder');
    if ($placeholder.length === 0) {
      $placeholder = $('<div id="video-placeholder"></div>');
      $('body').append($placeholder);
    }
    $placeholder.show();
    window.player = new Playerjs({
      id: 'video-placeholder',
      file: videos
    });
  };

  /**
   * Показывает кнопку "Добавить видео", оформленную так же, как и кнопка "Смотреть видео".
   * Кнопка располагается сразу после кнопки с id "video-player-button".
   */
  function showAddVideoButton() {
    var $watchBtn = $('#video-player-button');
    var $addVideoButton = $('#add-video-button');
    if ($addVideoButton.length === 0) {
      // Присваиваем кнопке тот же класс, что и у "Смотреть видео"
      $addVideoButton = $('<button id="add-video-button" class="video-btn">Добавить видео</button>');
      // Вставляем её рядом (после) кнопки "Смотреть видео"
      $watchBtn.after($addVideoButton);
    } else {
      $addVideoButton.show();
    }
  }

  /**
   * Скрывает кнопку "Добавить видео".
   */
  function hideAddVideoButton() {
    $('#add-video-button').hide();
  }

  /**
   * Обработчик нажатия на кнопку "Смотреть" / "Закрыть".
   * При клике создаётся (или скрывается) внешний плеер,
   * а также показывается или скрывается кнопка "Добавить видео".
   */
  $(document).on('click', '#video-player-button', function(e) {
    e.preventDefault();
    var $button = $(this);
    var videosData = $button.attr('data-videos');
    // Если данных в кнопке нет, можно попробовать найти их в другом элементе
    if (!videosData) {
      videosData = $('#editor').find('#video-player').attr('data-videos');
    }
    if (videosData) {
      try {
        var playerData = JSON.parse(videosData);
        if (playerData.videos && playerData.videos.length > 0) {
          if (!$('#video-placeholder').is(':visible')) {
            createExternalVideoPlayer(playerData.videos);
            $button.text('Закрыть');
            showAddVideoButton();
          } else {
            $('#video-placeholder').hide();
            $button.text('Показать видео');
            hideAddVideoButton();
          }
        }
      } catch (err) {
        console.error("Ошибка при парсинге данных плеера:", err);
      }
    } else {
      alert("Данные плеера не найдены в проекте!");
    }
  });

  /**
   * Обработчик клика по кнопке "Добавить видео".
   * Открывает диалог выбора файлов.
   */
  $(document).on('click', '#add-video-button', function() {
    var videoInput = $('<input type="file" accept="video/*" multiple style="display:none" id="video-file">');
    $('body').append(videoInput);
    videoInput.click();
  });

  /**
   * Если используется ещё и отдельная кнопка для выбора видео (с id="video"),
   * она также открывает диалог выбора файлов.
   */
  $('#video').click(function(){
    var videoInput = $('<input type="file" accept="video/*" multiple style="display:none" id="video-file">');
    $('body').append(videoInput);
    videoInput.click();
  });

  /**
   * Обработчик выбора файлов.
   * Загружает файлы на сервер, обновляет прогресс-бар и, по завершении,
   * добавляет новые видео к существующим (если таковые уже есть).
   */
  $('body').on('change', '#video-file', function() {
    if (!window.currentProject) {
      alert("Выберите проект");
      return;
    }

    var files = this.files;
    if (!files || files.length === 0) return;

    var totalFiles = files.length;
    var uploadedCount = 0;
    var newVideos = []; // сюда будут добавлены объекты новых видео
    var allowedExtensions = ["mp4", "webm", "avi", "mov"];

    // Массив для отслеживания прогресса загрузки каждого файла (значения от 0 до 1)
    var uploadProgress = new Array(totalFiles).fill(0);

    // Показываем и обнуляем прогресс-бар
    $('#upload-progress').show();
    $('#progress-bar').css('width', '0%');

    // Функция для обновления общего прогресса
    function updateOverallProgress() {
      var totalProgress = uploadProgress.reduce(function(sum, value) {
        return sum + value;
      }, 0);
      var avgProgress = totalProgress / totalFiles;
      $('#progress-bar').css('width', (avgProgress * 100) + '%');
    }

    /**
     * После завершения загрузки всех файлов обновляем кнопку-плейер.
     * Если кнопка уже существует, новые видео добавляются к уже существующим.
     */
    function createVideoPlayerMarker(newVideos) {
      if (newVideos.length === 0) {
        alert("Не удалось загрузить ни одного файла");
        $('#upload-progress').hide();
        return;
      }
      var $existingMarker = $('#editor').find('#video-player-button');
      var mergedVideos = [];
      if ($existingMarker.length === 0) {
        // Если кнопки ещё нет, создаём её с новыми видео
        mergedVideos = newVideos;
        var playerData = { videos: mergedVideos };
        var jsonData = JSON.stringify(playerData);
        var buttonHtml = '<button id="video-player-button" data-videos=\'' + jsonData + '\' ' +
                         'contenteditable="false" class="video-btn">Смотреть</button>';
        $('#editor').append(buttonHtml);
      } else {
        // Если кнопка уже есть, объединяем старые и новые видео
        var existingData = $existingMarker.attr('data-videos');
        try {
          var oldData = existingData ? JSON.parse(existingData) : {};
          if (oldData.videos && Array.isArray(oldData.videos)) {
            mergedVideos = oldData.videos.concat(newVideos);
          } else {
            mergedVideos = newVideos;
          }
        } catch (e) {
          console.error("Ошибка парсинга существующих данных плеера:", e);
          mergedVideos = newVideos;
        }
        var playerData = { videos: mergedVideos };
        var jsonData = JSON.stringify(playerData);
        $existingMarker.attr('data-videos', jsonData);
      }
      // Скрываем прогресс-бар после завершения
      $('#upload-progress').hide();
    }

    // Перебираем выбранные файлы и загружаем их
    for (var i = 0; i < files.length; i++) {
      (function(file, index) {
        var ext = file.name.split('.').pop().toLowerCase();
        if (allowedExtensions.indexOf(ext) === -1) {
          alert("Неверный формат файла: " + file.name);
          uploadedCount++;
          if (uploadedCount === totalFiles) {
            createVideoPlayerMarker(newVideos);
          }
          return;
        }
        var formData = new FormData();
        formData.append('project_name', window.currentProject);
        formData.append('file', file);
        $.ajax({
          url: '/upload_file',
          type: 'POST',
          data: formData,
          processData: false,
          contentType: false,
          dataType: 'json',
          xhr: function() {
            var xhr = new window.XMLHttpRequest();
            // Обновляем прогресс для каждого файла
            xhr.upload.addEventListener("progress", function(evt) {
              if (evt.lengthComputable) {
                var percentComplete = evt.loaded / evt.total;
                uploadProgress[index] = percentComplete;
                updateOverallProgress();
              }
            }, false);
            return xhr;
          },
          success: function(data) {
            if (data.success) {
              var fileUrl = "/workspace/" + window.currentProject + "/" + data.filename;
              var fileTitle = data.filename.split('/').pop();
              newVideos.push({ title: fileTitle, file: fileUrl });
            } else {
              alert("Ошибка загрузки файла " + file.name + ": " + data.error);
            }
          },
          error: function() {
            alert("Ошибка загрузки файла " + file.name);
          },
          complete: function() {
            uploadedCount++;
            if (uploadedCount === totalFiles) {
              createVideoPlayerMarker(newVideos);
            }
          }
        });
      })(files[i], i);
    }
  });

});
