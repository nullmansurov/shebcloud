$(document).ready(function () {
  // Переменные для координат касания
  var touchStartX = 0,
      touchStartY = 0,
      touchEndX = 0,
      touchEndY = 0,
      swipeThreshold = 30; // минимальное расстояние для определения свайпа (в пикселях)

  // Обработчик начала касания
  $(document).on('touchstart', function (e) {
    var touch = e.originalEvent.touches[0];
    touchStartX = touch.pageX;
    touchStartY = touch.pageY;
  });

  // Обработчик окончания касания
  $(document).on('touchend', function (e) {
    var touch = e.originalEvent.changedTouches[0];
    touchEndX = touch.pageX;
    touchEndY = touch.pageY;

    var diffX = touchStartX - touchEndX;
    var diffY = touchStartY - touchEndY;

    // Если горизонтальное движение больше вертикального и свайп влево
    if (Math.abs(diffX) > Math.abs(diffY) && diffX > swipeThreshold) {
      // Убираем класс 'open' для скрытия списка проектов
      $('#projects-list').removeClass('open');
    }
  });

  // Обработчик для кнопки "Проекты"
  $('#toggle-projects').on('click', function () {
    $('#projects-list').toggleClass('open'); // Переключаем класс для показа/скрытия панели
  });
});
