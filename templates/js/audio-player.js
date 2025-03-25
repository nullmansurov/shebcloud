// Переменные для отслеживания активного плеера
window.currentPlayingAudio = null;
window.currentPlayingContainer = null;
window.currentAudioUrl = null;
window.floatingControlsOriginalHtml = null;

$(document).ready(function() {
  
  // Функция форматирования времени в формате mm:ss
  function formatTime(seconds) {
    var minutes = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return minutes + ':' + (secs < 10 ? '0' : '') + secs;
  }

  // Функция для воспроизведения аудио по id с учётом остановки предыдущего
  window.playAudio = function(audioId) {
    var audio = document.getElementById(audioId);
    if (!audio) return;

    // Если уже играет другое аудио – ставим его на паузу
    if (window.currentPlayingAudio && window.currentPlayingAudio !== audio) {
      window.currentPlayingAudio.pause();
      window.currentPlayingAudio.removeEventListener('timeupdate', syncTimeUpdate);
    }

    window.currentPlayingAudio = audio;
    window.currentPlayingContainer = $(audio).closest('.custom-audio-player');
    window.currentAudioUrl = audio.currentSrc || audio.src;

    // Обработчик timeupdate для синхронного обновления
    audio.removeEventListener('timeupdate', syncTimeUpdate);
    audio.addEventListener('timeupdate', syncTimeUpdate);

    // При окончании аудио переходим к следующему
    audio.onended = function() {
      playNextAudio();
    };

    audio.play();
    updateFloatingControls(); // Обновляем видимость плавающего блока
    $('#fab-play-pause').text('Pause');
  };

  // Единый обработчик timeupdate для синхронного обновления инлайн- и плавающих контролей
  function syncTimeUpdate() {
    var audio = window.currentPlayingAudio;
    if (!audio || !audio.duration) return;

    // Обновление инлайн-прогресс-бара и текущего времени
    var container = $(audio).closest('.custom-audio-player');
    container.find('.progress-bar').css('width', ((audio.currentTime / audio.duration) * 100) + '%');
    container.find('.time').first().text(formatTime(audio.currentTime));

    // Обновление плавающих контролей
    updateFloatingControlsProgress();
  }

  // Пауза – просто ставит аудио на паузу, не скрывая плавающий блок
  window.pauseAudio = function(audioId) {
    var audio = document.getElementById(audioId);
    if (audio) {
      audio.pause();
      updateFloatingControls(); // Обновляем, чтобы блок оставался видимым
      $('#fab-play-pause').text('Play');
    }
  };

  // Остановка аудио – сбрасывает время, очищает ссылку и скрывает плавающий блок
  window.stopAudio = function(audioId, progressBarId, currentTimeId) {
    var audio = document.getElementById(audioId);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      var container = $(audio).closest('.custom-audio-player');
      container.find('.progress-bar').css('width', '0%');
      container.find('.time').first().text('0:00');
      window.currentAudioUrl = null;  // Очищаем ссылку
      hideFloatingControls();
    }
  };

  // Плавное переключение на следующее аудио
  function playNextAudio() {
    if (!window.currentPlayingContainer) return;
    var nextContainer = window.currentPlayingContainer.nextAll('.custom-audio-player').first();
    if (nextContainer.length > 0) {
      var nextAudio = nextContainer.find('audio')[0];
      if (nextAudio) {
        playAudio(nextAudio.id);
        return;
      }
    }
    showNoNextAudioMessage();
  }

  // Сообщение об отсутствии следующего аудио
  function showNoNextAudioMessage() {
    if (!window.floatingControlsOriginalHtml) {
      window.floatingControlsOriginalHtml = $('#floating-audio-controls').html();
    }
    $('#floating-audio-controls').html('<span style="color:#fff; font-size:14px;">Следующего аудио не найдено</span>');
    setTimeout(function(){
      if (window.currentPlayingAudio && !window.currentPlayingAudio.paused) {
        $('#floating-audio-controls').html(window.floatingControlsOriginalHtml);
      } else {
        hideFloatingControls();
        if (window.floatingControlsOriginalHtml) {
          $('#floating-audio-controls').html(window.floatingControlsOriginalHtml);
        }
      }
    }, 5000);
  }

  // Плавающие контролы аудио
  if ($('#floating-audio-controls').length === 0) {
    $('body').append(`
      <div id="floating-audio-controls" class="floating-audio-controls" style="display:none;">
        <button id="fab-play-pause">Play</button>
        <button id="fab-stop">Stop</button>
        <button id="fab-next">Next</button>
        <div class="fab-progress-container">
          <div class="fab-progress-bar"></div>
        </div>
        <span class="fab-time" id="fab-current-time">0:00</span> / 
        <span class="fab-time" id="fab-duration">0:00</span>
      </div>
    `);
  }

  function hideFloatingControls() {
    $('#floating-audio-controls').fadeOut();
    window.currentPlayingAudio = null;
    window.currentPlayingContainer = null;
    window.currentAudioUrl = null;
  }

  function updateFloatingControls() {
    if (!window.currentPlayingAudio) return;
    var audio = window.currentPlayingAudio;
    if (audio.paused) {
      $('#floating-audio-controls').fadeIn();
      return;
    }
    var container = window.currentPlayingContainer;
    if (container && container.length > 0) {
      var rect = container[0].getBoundingClientRect();
      var isVisible = (rect.top < window.innerHeight && rect.bottom > 0);
      if (!isVisible) {
        $('#floating-audio-controls').fadeIn();
        if (audio.duration) {
          $('#fab-duration').text(formatTime(audio.duration));
        }
      } else {
        $('#floating-audio-controls').fadeOut();
      }
    }
  }

  function updateFloatingControlsProgress() {
    if (!window.currentPlayingAudio || !window.currentPlayingAudio.duration) return;
    var audio = window.currentPlayingAudio;
    var progress = (audio.currentTime / audio.duration) * 100;
    $('#floating-audio-controls .fab-progress-bar').css('width', progress + '%');
    $('#fab-current-time').text(formatTime(audio.currentTime));
    $('#fab-duration').text(formatTime(audio.duration));
  }

  $('#fab-play-pause').click(function() {
    if (!window.currentPlayingAudio) return;
    if (window.currentPlayingAudio.paused) {
      window.currentPlayingAudio.play();
      $(this).text('Pause');
    } else {
      window.currentPlayingAudio.pause();
      $(this).text('Play');
    }
    updateFloatingControls();
  });

  $('#fab-stop').click(function() {
    if (!window.currentPlayingAudio) return;
    window.currentPlayingAudio.pause();
    window.currentPlayingAudio.currentTime = 0;
    updateFloatingControlsProgress();
    hideFloatingControls();
  });

  $('#fab-next').click(function() {
    playNextAudio();
  });

  $(window).on('scroll', function() {
    updateFloatingControls();
  });

  setInterval(updateFloatingControls, 1000);

  // Обработчик для изменения проекта
  window.openProject = function(project) {
    window.currentProject = project;
    $.get('/load_project', { project_name: project }, function(data){
      if (data.success) {
        $('#editor').html(data.content);
        $('#main-header').fadeOut(200, function() {
          $(this).text(project).fadeIn(200);
        });
        document.title = project + " | Артахана мастерская";
        $('.project-item').removeClass('selected');
        $('.project-item[data-project="' + project + '"]').addClass('selected');

        // Закрываем плавающую панель и очищаем состояние
        hideFloatingControls();
      } else {
        $('#editor').html('');
        $('#main-header').text("Артхана мастерская - Библиотека");
        document.title = "Артахана мастерская - Проекты";
        alert(data.error);
      }
    });
  };
});

document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    updateFloatingControls();
    updateFloatingControlsProgress();
  }
});
