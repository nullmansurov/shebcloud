// Подключаем стили для темной темы
const darkThemeStylesheet = document.createElement('link');
darkThemeStylesheet.rel = 'stylesheet';
darkThemeStylesheet.href = '/js/dark_styles.css';

// Проверяем, какая тема была сохранена в localStorage, и применяем ее
window.onload = () => {
  const savedTheme = localStorage.getItem('theme');

  if (savedTheme === 'dark') {
    document.head.appendChild(darkThemeStylesheet);
  } else {
  }

  // Делаем body видимым после небольшой задержки (100 мс)
  setTimeout(() => {
    document.body.style.visibility = 'visible';
  }, 300);
};

// Функция для переключения темы
function toggleTheme() {
  const currentTheme = localStorage.getItem('theme');

  if (currentTheme === 'dark') {
    // Отключаем темную тему
    document.head.removeChild(darkThemeStylesheet);
    localStorage.setItem('theme', 'light');
  } else {
    // Включаем темную тему
    document.head.appendChild(darkThemeStylesheet);
    localStorage.setItem('theme', 'dark');
  }
}

// Добавляем обработчик события для кнопки переключения темы
document.getElementById('toggle-theme').addEventListener('click', toggleTheme);

// Функция для мобильных устройств - раскрывает и компьютерную, и скрытую часть
function toggleMobileToolbar() {
  var desktopToolbarVisible = document.querySelector('.toolbar-visible-desktop');  // видимая часть для десктопов
  var hiddenSection = document.querySelector('.toolbar-hidden');  // скрытая часть
  var btn = document.getElementById('mobile-more');  // кнопка для мобильных

  // Если видимая часть для десктопов существует, переключаем её
  if (desktopToolbarVisible) {
    desktopToolbarVisible.style.display = (desktopToolbarVisible.style.display === 'none' || desktopToolbarVisible.style.display === '') ? 'flex' : 'none';
  }

  // Переключаем скрытую часть
  if (hiddenSection) {
    hiddenSection.style.display = (hiddenSection.style.display === 'none' || hiddenSection.style.display === '') ? 'flex' : 'none';
  }

  // Меняем кнопку и текст
  btn.innerHTML = (btn.innerHTML === '▼') ? '▲' : '▼';
}

// Функция для десктопных устройств - раскрывает только скрытую часть
function toggleDesktopToolbar() {
  var hiddenSection = document.querySelector('.toolbar-hidden');  // скрытая часть
  var btn = document.getElementById('desktop-more');  // кнопка для десктопа

  // Показываем или скрываем только скрытую часть
  if (hiddenSection) {
    hiddenSection.style.display = (hiddenSection.style.display === 'none' || hiddenSection.style.display === '') ? 'flex' : 'none';
  }

  // Меняем кнопку и текст
  btn.innerHTML = (btn.innerHTML === '▼') ? '▲' : '▼';
}

// Добавляем обработчики для мобильных и десктопных кнопок
document.getElementById('mobile-more').addEventListener('click', toggleMobileToolbar);
document.getElementById('desktop-more').addEventListener('click', toggleDesktopToolbar);


