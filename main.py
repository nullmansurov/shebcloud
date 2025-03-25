import sys
from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for, flash
import os
import json
import shutil
import re
import time
import subprocess
from google import genai
from datetime import datetime, timedelta
import requests


# Импорт классов для аутентификации и работы с формами
from flask_login import LoginManager, login_required, current_user, login_user, logout_user, UserMixin
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField, SelectField
from wtforms.validators import DataRequired, Length
from functools import wraps
from flask import send_from_directory, abort
from werkzeug.utils import secure_filename
from flask import Response, stream_with_context
import os, mimetypes

# Декоратор для проверки ролей
def roles_required(*allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if current_user.role not in allowed_roles:
                flash("Доступ запрещён!", "danger")
                return redirect(url_for("library"))
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Инициализация приложения Flask
app = Flask(__name__)
app.secret_key = 'supersecretkey' 

# Конфигурация БД для хранения пользователей
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///users.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

# Инициализация Flask-Login
login_manager = LoginManager(app)
login_manager.login_view = 'login'  # если не авторизован, перенаправляет на /login

# ===================== Модель пользователя =====================
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(10), nullable=False, default="user")  # Новый столбец

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# ===================== Форма для создания пользователя (админка) =====================
ROLES = ["viewer", "user", "admin"]

class CreateUserForm(FlaskForm):
    username = StringField("Имя пользователя", validators=[DataRequired(), Length(min=3, max=20)])
    password = PasswordField("Пароль", validators=[DataRequired(), Length(min=6)])
    role = SelectField("Роль", choices=[(r, r) for r in ROLES], validators=[DataRequired()])
    submit = SubmitField("Создать пользователя")

# ===================== Пути к директориям =====================
# Используем директорию, где находится main.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(BASE_DIR, 'templates')
PROJECTS_DIR = os.path.join(BASE_DIR, 'projects')

# Настройка папки шаблонов
app.template_folder = TEMPLATE_DIR

# Создание необходимых директорий, если их ещё нет
os.makedirs(PROJECTS_DIR, exist_ok=True)
os.makedirs(TEMPLATE_DIR, exist_ok=True)

# ===================== Функции для работы с избранными проектами =====================
def load_favorites():
    fav_path = os.path.join(PROJECTS_DIR, '.favorites.json')
    if os.path.exists(fav_path):
        with open(fav_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_favorites(favorites):
    fav_path = os.path.join(PROJECTS_DIR, '.favorites.json')
    with open(fav_path, 'w', encoding='utf-8') as f:
        json.dump(favorites, f, ensure_ascii=False)

# ===================== API для работы с проектами =====================

# Только для пользователей с ролями "user" и "admin" (viewer не имеет доступа)
@app.route('/rename_project', methods=['POST'])
@login_required
@roles_required("user", "admin")
def rename_project():
    old_name = request.form.get('old_name')
    new_name = request.form.get('new_name')
    if not old_name or not new_name:
        return jsonify({'success': False, 'error': 'Оба имени обязательны'}), 400
    if not re.match(r'^[a-zA-Zа-яА-ЯёЁ0-9_ \-]+$', new_name):
        return jsonify({
            'success': False,
            'error': 'Недопустимые символы. Разрешены: буквы, цифры, пробелы, - и _'
        }), 400
    old_path = os.path.join(PROJECTS_DIR, old_name)
    new_path = os.path.join(PROJECTS_DIR, new_name)
    if not os.path.exists(old_path):
        return jsonify({'success': False, 'error': 'Исходный проект не найден'}), 404
    if os.path.exists(new_path):
        return jsonify({'success': False, 'error': 'Проект с таким именем уже существует'}), 409
    try:
        os.rename(old_path, new_path)
        # Обновление списка избранных
        favorites = load_favorites()
        updated_favorites = [new_name if name == old_name else name for name in favorites]
        save_favorites(updated_favorites)
        return jsonify({'success': True, 'new_name': new_name})
    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка сервера: {str(e)}'}), 500

# Только для пользователей с ролями "user" и "admin"
@app.route('/favorite_project', methods=['POST'])
@login_required
@roles_required("user", "admin")
def favorite_project():
    project_name = request.form.get('project_name')
    action = request.form.get('action')
    if not project_name or action not in ['add', 'remove']:
        return jsonify({'success': False, 'error': 'Invalid parameters'})
    favorites = load_favorites()
    if action == 'add':
        if project_name not in favorites:
            favorites.append(project_name)
    elif action == 'remove':
        if project_name in favorites:
            favorites.remove(project_name)
    save_favorites(favorites)
    return jsonify({'success': True, 'favorites': favorites})

# Без ограничений по ролям (просмотр избранных)
@app.route('/load_favorites', methods=['GET'])
@login_required
def load_favorites_route():
    return jsonify({'success': True, 'favorites': load_favorites()})

# Удаление проектов – только для **admin**
@app.route('/delete_project', methods=['POST'])
@login_required
@roles_required("admin")
def delete_project():
    project_name = request.form.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})
    project_path = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_path):
        return jsonify({'success': False, 'error': 'Project not found'})
    try:
        shutil.rmtree(project_path)
        # Обновление избранных
        favorites = load_favorites()
        if project_name in favorites:
            favorites.remove(project_name)
            save_favorites(favorites)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# Создание проектов – для "user" и "admin"
@app.route('/create_project', methods=['POST'])
@login_required
@roles_required("user", "admin")
def create_project():
    project_name = request.form.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})
    project_path = os.path.join(PROJECTS_DIR, project_name)
    if os.path.exists(project_path):
        return jsonify({'success': False, 'error': 'Project already exists'})
    try:
        os.makedirs(project_path)
        index_file = os.path.join(project_path, 'index.html')
        with open(index_file, 'w', encoding='utf-8') as f:
            f.write(f"""<!DOCTYPE html>
<html>
<head>
  <meta charset='UTF-8'>
  <title>{project_name}</title>
</head>
<body>
  <!-- Project content -->
</body>
</html>""")
        return jsonify({'success': True, 'project': project_name})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# Глобальный словарь для хранения информации по редактированию проектов
active_project_edits = {}
EDIT_TIMEOUT = timedelta(seconds=30)

# Эндпоинт для загрузки проекта (просмотр/редактирование)
@app.route('/load_project', methods=['GET'])
@login_required  # если требуется авторизация
def load_project():
    project_name = request.args.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})
    
    project_file = os.path.join(PROJECTS_DIR, project_name, 'index.html')
    if not os.path.exists(project_file):
        return jsonify({'success': False, 'error': 'Project not found'})
    
    try:
        with open(project_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    
    user = current_user.username  # идентификатор пользователя
    now = datetime.now()

    if project_name not in active_project_edits:
        # Проект ещё никто не редактирует – назначаем текущего пользователя редактором
        active_project_edits[project_name] = {
            'editor': user,
            'last_heartbeat': now,
            'waiting': []
        }
        can_edit = True
    else:
        record = active_project_edits[project_name]
        # Если активный редактор не обновлялся более 30 секунд – переключаем его
        if now - record['last_heartbeat'] > EDIT_TIMEOUT:
            if record['waiting']:
                new_editor = record['waiting'].pop(0)['user']
            else:
                new_editor = user
            record['editor'] = new_editor
            record['last_heartbeat'] = now
        # Обновляем статус для текущего пользователя
        record = active_project_edits[project_name]  # обновлённая запись
        if record['editor'] == user:
            record['last_heartbeat'] = now
            can_edit = True
        else:
            # Если пользователь не является редактором, добавляем его в очередь (если ещё нет)
            found = any(entry['user'] == user for entry in record['waiting'])
            if not found:
                record['waiting'].append({'user': user, 'last_heartbeat': now})
            can_edit = False
        
        # Чистим очередь от неактивных
        record['waiting'] = [entry for entry in record['waiting'] if now - entry['last_heartbeat'] < EDIT_TIMEOUT]
    
    response = {
        'success': True,
        'content': content,
        'can_edit': can_edit,
        'editor': active_project_edits[project_name]['editor'],
        'message': None if can_edit else f"Проект редактируется пользователем {active_project_edits[project_name]['editor']}"
    }
    return jsonify(response)

@app.route('/search_projects', methods=['GET'])
@login_required
def search_projects():
    query = request.args.get('query', '').strip().lower()
    try:
        projects = []
        for project in os.listdir(PROJECTS_DIR):
            project_path = os.path.join(PROJECTS_DIR, project)
            if os.path.isdir(project_path) and (query in project.lower() if query else True):
                projects.append(project)
        projects.sort()
        offset = int(request.args.get('offset', 0))
        limit = int(request.args.get('limit', 10))
        paginated = projects[offset: offset + limit]
        return jsonify({'success': True, 'projects': paginated})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Эндпоинт heartbeat для обновления активности и проверки смены редактора
@app.route('/heartbeat', methods=['POST'])
@login_required
def heartbeat():
    project_name = request.form.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})
    
    user = current_user.username
    now = datetime.now()
    
    if project_name not in active_project_edits:
        return jsonify({'success': False, 'error': 'Проект не загружен'})
    
    record = active_project_edits[project_name]
    # Если пользователь не редактор – обновляем или добавляем в очередь
    if record['editor'] != user:
        updated = False
        for entry in record['waiting']:
            if entry['user'] == user:
                entry['last_heartbeat'] = now
                updated = True
                break
        if not updated:
            record['waiting'].append({'user': user, 'last_heartbeat': now})
    else:
        record['last_heartbeat'] = now
    
    # Если активный редактор неактивен – переключаем на первого из очереди
    if now - record['last_heartbeat'] > EDIT_TIMEOUT:
        if record['waiting']:
            new_editor = record['waiting'].pop(0)['user']
            record['editor'] = new_editor
            record['last_heartbeat'] = now
    # Чистим очередь от неактивных
    record['waiting'] = [entry for entry in record['waiting'] if now - entry['last_heartbeat'] < EDIT_TIMEOUT]
    
    can_edit = (record['editor'] == user)
    return jsonify({
        'success': True,
        'can_edit': can_edit,
        'editor': record['editor']
    })


# Эндпоинт для получения содержимого проекта без изменения блокировки (для автообновления у ожидающих)
@app.route('/get_project_content', methods=['GET'])
@login_required
def get_project_content():
    project_name = request.args.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})
    
    project_file = os.path.join(PROJECTS_DIR, project_name, 'index.html')
    if not os.path.exists(project_file):
        return jsonify({'success': False, 'error': 'Project not found'})
    
    try:
        with open(project_file, 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({'success': True, 'content': content})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/download_file', methods=['GET'])
def download_file():
    project_name = request.args.get('project_name')
    file_name = request.args.get('file_name')
    
    if not project_name or not file_name:
        return jsonify({'success': False, 'error': 'Имя проекта и файла обязательны'}), 400

    file_path = os.path.join(PROJECTS_DIR, project_name, file_name)
    
    if not os.path.exists(file_path):
        return jsonify({'success': False, 'error': 'Файл не найден'}), 404

    def generate():
        with open(file_path, 'rb') as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                yield chunk

    mime_type = mimetypes.guess_type(file_name)[0] or 'application/octet-stream'
    response = Response(stream_with_context(generate()), mimetype=mime_type)
    response.headers["Content-Disposition"] = f"attachment; filename={file_name}"
    return response

        
@app.route('/save_project', methods=['POST'])
@login_required
@roles_required("user", "admin")
def save_project():
    project_name = request.form.get('project_name')
    content = request.form.get('content')
    try:
        chunk_number = int(request.form.get('chunk_number', 1))
        total_chunks = int(request.form.get('total_chunks', 1))
    except (ValueError, TypeError):
        chunk_number = 1
        total_chunks = 1

    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})
    
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_dir):
        os.makedirs(project_dir)
    
    project_file = os.path.join(project_dir, 'index.html')
    try:
        # Если это первый чанк – перезаписываем, иначе дозаписываем
        mode = 'w' if chunk_number == 1 else 'a'
        with open(project_file, mode, encoding='utf-8') as f:
            f.write(content)
        # Здесь можно выполнить дополнительную логику по завершению (если chunk_number == total_chunks)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# Загрузка файла в проект – для "user" и "admin"
@app.route('/upload_file', methods=['POST'])
@login_required
@roles_required("user", "admin")
def upload_file():
    project_name = request.form.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})
    file = request.files.get('file')
    if not file:
        return jsonify({'success': False, 'error': 'No file uploaded'})
    project_path = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_path):
        return jsonify({'success': False, 'error': 'Project not found'})
    try:
        filename = file.filename
        file.save(os.path.join(project_path, filename))
        return jsonify({'success': True, 'filename': filename})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# Эндпоинт Gemini API – для "user" и "admin"
@app.route('/gemini_api', methods=['POST'])
@login_required
@roles_required("user", "admin")
def gemini_api():
    if request.is_json:
        data = request.get_json()
        text = data.get('text')
    else:
        text = request.form.get('text')
    if not text:
        return jsonify({'success': False, 'error': 'Параметр "text" обязателен'}), 400
    try:
        from google import genai
        client = genai.Client(api_key="AIzaSyCGXfXLs2PQ7IvyTY8GVVVUnetIBIR8QjU")
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=text
        )
        return jsonify({'success': True, 'response': response.text})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Отдача файлов проекта (например, для preview)
@app.route('/workspace/<project>/<filename>')
def serve_workspace_file(project, filename):
    path = os.path.join(PROJECTS_DIR, project, filename)
    if not os.path.exists(path):
        return abort(404)
    file_size = os.path.getsize(path)
    mime_type = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    range_header = request.headers.get('Range', None)

    if range_header:
        # Заголовок выглядит примерно так: "bytes=0-1023"
        range_match = re.search(r'bytes=(\d+)-(\d*)', range_header)
        if range_match:
            start = int(range_match.group(1))
            end_str = range_match.group(2)
            end = int(end_str) if end_str else file_size - 1
        else:
            start, end = 0, file_size - 1
        length = end - start + 1

        def generate():
            with open(path, 'rb') as f:
                f.seek(start)
                remaining = length
                chunk_size = 65536
                while remaining > 0:
                    data = f.read(min(chunk_size, remaining))
                    if not data:
                        break
                    yield data
                    remaining -= len(data)
        response = Response(stream_with_context(generate()), status=206, mimetype=mime_type)
        response.headers.add('Content-Range', f'bytes {start}-{end}/{file_size}')
        response.headers.add('Accept-Ranges', 'bytes')
        response.headers.add('Content-Length', str(length))
        return response
    else:
        def generate():
            with open(path, 'rb') as f:
                chunk_size = 65536  # 64 КБ
                while True:
                    data = f.read(chunk_size)
                    if not data:
                        break
                    yield data
        response = Response(stream_with_context(generate()), mimetype=mime_type)
        # Обязательно передаём размер файла и поддержку диапазона
        response.headers.add('Accept-Ranges', 'bytes')
        response.headers.add('Content-Length', str(file_size))
        return response

@app.route('/styles.css')
def styles():
    return send_from_directory(app.template_folder, 'styles.css')

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(app.template_folder, 'js'), filename)

# ===================== Маршруты аутентификации =====================
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('library'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and user.password == password:
            login_user(user)
            flash("Успешный вход!", "success")
            return redirect(url_for('library'))
        else:
            flash("Неверный логин или пароль!", "danger")
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash("Вы вышли из системы", "info")
    return redirect(url_for('login'))

# ===================== Главные маршруты =====================
@app.route('/')
def home():
    if current_user.is_authenticated:
        return redirect(url_for('library'))
    else:
        return redirect(url_for('login'))

# Страница библиотеки – доступна всем авторизованным (viewer, user, admin)
@app.route('/library', methods=['GET'])
@login_required
def library():
    try:
        all_projects = [p for p in os.listdir(PROJECTS_DIR)
                        if os.path.isdir(os.path.join(PROJECTS_DIR, p))]
    except FileNotFoundError:
        all_projects = []
    favorites = load_favorites()
    favorite_projects = [p for p in all_projects if p in favorites]
    other_projects = [p for p in all_projects if p not in favorites]
    projects_to_display = favorite_projects + other_projects
    page = int(request.args.get('page', 1))
    projects_per_page = 20
    start_index = (page - 1) * projects_per_page
    end_index = start_index + projects_per_page
    projects_page = projects_to_display[start_index:end_index]
    has_more = end_index < len(projects_to_display)
    return render_template('index.html',
                           projects=projects_page,
                           favorites=favorites,
                           current_page=page,
                           has_more=has_more)


# ===================== Маршруты админки =====================
# Доступ только для admin
@app.route('/admin', methods=['GET', 'POST'])
@login_required
@roles_required("admin")
def admin():
    form = CreateUserForm()
    if form.validate_on_submit():
        if User.query.filter_by(username=form.username.data).first():
            flash("Пользователь уже существует!", "warning")
        else:
            new_user = User(
                username=form.username.data,
                password=form.password.data,
                role=form.role.data
            )
            db.session.add(new_user)
            db.session.commit()
            flash(f"Пользователь {form.username.data} создан!", "success")
    users = User.query.all()
    return render_template("admin.html", form=form, users=users)

# Удаление пользователей – доступ только для admin
@app.route('/delete_user', methods=["POST"])
@login_required
@roles_required("admin")
def delete_user():
    user_id = request.form.get("user_id")
    user = User.query.get(user_id)
    if user:
        if user.id == current_user.id:
            flash("Нельзя удалить самого себя", "danger")
        else:
            db.session.delete(user)
            db.session.commit()
            flash("Пользователь удалён", "success")
    else:
        flash("Пользователь не найден", "warning")
    return redirect(url_for("admin"))


# ============================
# Модель для сообщений чата
# ============================
class ChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), nullable=False)
    text = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)


# ===========================================
# Новый эндпоинт для чата
# ===========================================
@app.route('/chat_api', methods=['GET', 'POST'])
@login_required
def chat_api():
    if request.method == 'GET':
        # Получаем историю сообщений, сортируя по времени
        messages = ChatMessage.query.order_by(ChatMessage.timestamp).all()
        messages_data = [{
            'username': msg.username,
            'text': msg.text,
            'timestamp': msg.timestamp.isoformat()
        } for msg in messages]
        return jsonify({'success': True, 'messages': messages_data})
    
    elif request.method == 'POST':
        if request.is_json:
            data = request.get_json()
            text = data.get('text')
        else:
            text = request.form.get('text')
        
        if not text:
            return jsonify({'success': False, 'error': 'Параметр "text" обязателен'}), 400
        
        # Используем username текущего пользователя в качестве никнейма в чате
        new_message = ChatMessage(username=current_user.username, text=text, timestamp=datetime.utcnow())
        db.session.add(new_message)
        db.session.commit()
        return jsonify({'success': True})


# ===========================================
# Эндпоинт для отображения HTML-страницы чата
# ===========================================
@app.route('/chat')
@login_required
def chat_page():
    # Рендерим шаблон chat.html (его пример приведён ниже)
    return render_template('chat.html')

# ===========================================
# Эндпоинт для Storage_api
# ===========================================

@app.route('/storage_api', methods=['GET', 'DELETE'])
@login_required
@roles_required("user", "admin")
def storage_api():
    # Для GET-запроса ожидаем project_name в query-параметрах,
    # для DELETE – либо в form, либо в JSON
    if request.method == 'GET':
        project_name = request.args.get('project_name')
    else:
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form
        project_name = data.get('project_name')

    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'}), 400

    project_path = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_path):
        return jsonify({'success': False, 'error': 'Project not found'}), 404

    if request.method == 'GET':
        try:
            # Получаем только файлы, исключая index.html (независимо от регистра)
            files = [
                f for f in os.listdir(project_path)
                if os.path.isfile(os.path.join(project_path, f)) and f.lower() != 'index.html'
            ]
            return jsonify({'success': True, 'files': files})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500


    elif request.method == 'DELETE':
        # Ожидаем, что параметр "files" содержит список имен файлов (или одиночное имя)
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form
        files_to_delete = data.get('files')
        if not files_to_delete:
            return jsonify({'success': False, 'error': 'No files specified'}), 400
        if isinstance(files_to_delete, str):
            files_to_delete = [files_to_delete]

        errors = []
        for filename in files_to_delete:
            file_path = os.path.join(project_path, filename)
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                else:
                    errors.append(f"File {filename} not found.")
            except Exception as e:
                errors.append(f"Error deleting {filename}: {str(e)}")
        if errors:
            return jsonify({'success': False, 'error': errors}), 500
        return jsonify({'success': True})


@app.route('/storage_open', methods=['GET'])
@login_required
@roles_required("admin")
def storage_open():
    project_name = request.args.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'}), 400

    project_path = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_path):
        return jsonify({'success': False, 'error': 'Project not found'}), 404

    try:
        if os.name == 'nt':  # Windows
            os.startfile(project_path)
        elif sys.platform == 'darwin':  # macOS
            subprocess.Popen(['open', project_path])
        else:  # Linux и другие
            subprocess.Popen(['xdg-open', project_path])
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ------------------- Телеграм бот -------------------
from wtforms import BooleanField
import threading
import telebot
from sqlalchemy import case, func
from sortedcontainers import SortedList
from telebot import types

telegram_bot_instance = None
telegram_bot_thread = None

def stop_telegram_bot():
    """Останавливает работу телеграм-бота, если он запущен."""
    global telegram_bot_instance, telegram_bot_thread
    if telegram_bot_instance:
        telegram_bot_instance.stop_polling()
    if telegram_bot_thread and telegram_bot_thread.is_alive():
        telegram_bot_thread.join()  # Ожидаем завершения потока, если он ещё работает
    telegram_bot_thread = None
    telegram_bot_instance = None


def start_telegram_bot(token):
    """Запускает телеграм-бота в отдельном потоке, если он ещё не запущен."""
    global telegram_bot_thread
    if telegram_bot_thread and telegram_bot_thread.is_alive():
        stop_telegram_bot()
    telegram_bot_thread = threading.Thread(target=run_telegram_bot, args=(token,), daemon=True)
    telegram_bot_thread.start()


# --- Модели ---
class TelegramToken(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(100), nullable=False)

class TelegramMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.String(50), nullable=False)
    sender = db.Column(db.String(20), nullable=False)
    text = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    group_name = db.Column(db.String(100), nullable=True)
    username = db.Column(db.String(50), nullable=True)
    first_name = db.Column(db.String(50), nullable=True)
    new = db.Column(db.Boolean, default=True, nullable=False)
    media_path = db.Column(db.String(255), nullable=True)

# Новая модель для хранения скриптов (функций) бота
class TelegramScript(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    keyword = db.Column(db.String(100), nullable=False)  # Ключевое слово для триггера
    code = db.Column(db.Text, nullable=False)  # Код, который будет выполнен
    description = db.Column(db.String(255), nullable=True)  # Описание скрипта

# --- Форма для задания/изменения токена ---
class SetTokenForm(FlaskForm):
    token = StringField("Telegram Bot Token", validators=[DataRequired()])
    confirm = BooleanField("Подтверждаю удаление всей переписки, если токен изменён")
    submit = SubmitField("Сохранить токен")

def run_telegram_bot(token):
    """Запускает телеграм-бота и обрабатывает входящие сообщения, включая медиафайлы."""
    global telegram_bot_instance
    telegram_bot_instance = telebot.TeleBot(token)

    def save_message(chat_id, sender, text, group_name, username, first_name, media_path):
        """Сохраняет сообщение в БД."""
        new_msg = TelegramMessage(
            chat_id=str(chat_id),
            sender=sender,
            text=text,
            group_name=group_name,
            username=username,
            first_name=first_name,
            new=True,
            media_path=media_path
        )
        db.session.add(new_msg)
        db.session.commit()

    def handle_start(message):
        """Обработчик команды /start для приветственного сообщения и кнопки."""
        # Создаем inline-клавиатуру с кнопкой
        markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
        button = types.KeyboardButton("Начать")
        markup.add(button)
        
        # Отправляем сообщение с кнопкой
        telegram_bot_instance.send_message(
            message.chat.id,
            "Добро пожаловать!",
            reply_markup=markup
        )

    # Обработчик команды /start
    @telegram_bot_instance.message_handler(commands=['start'])
    def send_welcome(message):
        handle_start(message)

    # Обработчик для всех нужных типов сообщений
    @telegram_bot_instance.message_handler(
        content_types=['text', 'photo', 'audio', 'video', 'voice', 'document'],
        func=lambda message: not (message.text and message.text.startswith('/'))
    )
    def handle_all_messages(message):
        # Для работы с БД из фонового потока используем контекст приложения
        with app.app_context():
            # Если сообщение из группы – берём название группы
            group_name = message.chat.title if message.chat.type in ["group", "supergroup"] else None

            # Получаем данные отправителя
            username = message.from_user.username if message.from_user.username else ""
            first_name = message.from_user.first_name if message.from_user.first_name else ""

            # Изначально текст сообщения и путь к медиа отсутствуют
            message_text = message.text if message.text else ""
            media_path = None

            # Папка для сохранения скачанных файлов
            download_folder = os.path.join('telegram', 'download')
            if not os.path.exists(download_folder):
                os.makedirs(download_folder)

            # Обработка различных типов контента
            if message.content_type == 'photo':
                # Для фото – выбираем последнее из списка (наивысшее качество)
                file_id = message.photo[-1].file_id
                file_info = telegram_bot_instance.get_file(file_id)
                downloaded_file = telegram_bot_instance.download_file(file_info.file_path)
                filename = secure_filename(file_info.file_path.split('/')[-1])
                media_path = os.path.join(download_folder, filename)
                with open(media_path, 'wb') as new_file:
                    new_file.write(downloaded_file)

            elif message.content_type == 'document':
                file_id = message.document.file_id
                file_info = telegram_bot_instance.get_file(file_id)
                downloaded_file = telegram_bot_instance.download_file(file_info.file_path)
                # Используем оригинальное имя файла, если оно задано
                filename = secure_filename(message.document.file_name) if message.document.file_name else secure_filename(file_info.file_path.split('/')[-1])
                media_path = os.path.join(download_folder, filename)
                with open(media_path, 'wb') as new_file:
                    new_file.write(downloaded_file)

            elif message.content_type == 'video':
                file_id = message.video.file_id
                file_info = telegram_bot_instance.get_file(file_id)
                downloaded_file = telegram_bot_instance.download_file(file_info.file_path)
                filename = secure_filename(file_info.file_path.split('/')[-1])
                media_path = os.path.join(download_folder, filename)
                with open(media_path, 'wb') as new_file:
                    new_file.write(downloaded_file)

            elif message.content_type == 'voice':
                file_id = message.voice.file_id
                file_info = telegram_bot_instance.get_file(file_id)
                downloaded_file = telegram_bot_instance.download_file(file_info.file_path)
                filename = secure_filename(file_info.file_path.split('/')[-1])
                media_path = os.path.join(download_folder, filename)
                with open(media_path, 'wb') as new_file:
                    new_file.write(downloaded_file)

            # Если сообщение текстовое — сохраняем сообщение пользователя и ищем скрипт по ключевому слову
            if message.content_type == 'text':
                # Сохраняем исходное сообщение пользователя
                save_message(
                    chat_id=message.chat.id,
                    sender="user",
                    text=message_text,
                    group_name=group_name,
                    username=username,
                    first_name=first_name,
                    media_path=media_path
                )

                # Приводим текст сообщения к нижнему регистру и убираем лишние пробелы
                text = message.text.strip().lower()

                # Ищем подходящий скрипт по ключевому слову (по вхождению)
                script = TelegramScript.query.filter(
                    db.func.lower(TelegramScript.keyword) == text
                ).first()

                if script:
                    try:
                        # Подготавливаем окружение для выполнения скрипта
                        local_vars = {
                            "Message": message,  # Объект сообщения
                            "telegram_bot_instance": telegram_bot_instance,
                            "types": types  # Модуль с типами (например, из pyTelegramBotAPI)
                        }
                        # Выполняем код, сохранённый в базе (ожидается, что он определит функцию bot_response)
                        exec(script.code, globals(), local_vars)

                        if "bot_response" in local_vars and callable(local_vars["bot_response"]):
                            # Вызываем функцию, которая отправляет ответ
                            local_vars["bot_response"]()
                        else:
                            print("Функция bot_response не определена или не является вызываемой")
                    except Exception as e:
                        print("Ошибка выполнения скрипта:", e)

                    # Попытаемся извлечь путь к фото (если есть вызов send_photo)
                    media_path_found = None
                    photo_match = re.search(r"telegram_bot_instance\.send_photo\(\s*[^,]+,\s*open\('(.*?)'", script.code)
                    if photo_match:
                        media_path_found = photo_match.group(1)

                    # Извлекаем все вызовы send_message из кода скрипта
                    send_message_pattern = r"telegram_bot_instance\.send_message\(\s*([^,]+),\s*'(.*?)'\)"
                    message_matches = re.findall(send_message_pattern, script.code)

                    if message_matches:
                        for chat_expr, msg_text in message_matches:
                            chat_expr = chat_expr.strip()
                            # Если в первом параметре содержится "Message.chat.id" – это ответ исходному пользователю
                            if "Message.chat.id" in chat_expr:
                                target_chat_id = message.chat.id
                            else:
                                # Иначе предполагаем, что передан конкретный chat_id в виде литерала (удаляем кавычки)
                                target_chat_id = chat_expr.strip("'\"")
                                # Если chat_id должен быть числом, можно выполнить конвертацию:
                                # target_chat_id = int(target_chat_id)

                            try:
                                save_message(
                                    chat_id=target_chat_id,
                                    sender="bot",
                                    text=msg_text,  # Текст сообщения из send_message
                                    group_name=group_name,
                                    username="Bot",  # Или имя вашего бота
                                    first_name="Бот",
                                    media_path=media_path_found  # Путь к файлу, если найден
                                )
                            except Exception as e:
                                print("Ошибка сохранения сообщения бота:", e)
                    else:
                        print("В коде не найдены вызовы send_message")
                else:
                    print("Скрипт не найден для сообщения:", message.text)

            else:
                # Если сообщение не текстовое, сохраняем его как сообщение пользователя
                save_message(
                    chat_id=message.chat.id,
                    sender="user",
                    text=message_text,
                    group_name=group_name,
                    username=username,
                    first_name=first_name,
                    media_path=media_path
                )

    # Запуск polling – блокирующий вызов
    while True:
        try:
            telegram_bot_instance.polling(none_stop=True)
        except Exception as e:
            print(f"Ошибка при выполнении polling: {e}")
            time.sleep(15)

# --- Основной маршрут чата ---
@app.route('/telegram', methods=['GET', 'POST'])
@login_required
@roles_required("user", "admin")
def telegram_interface():

    token_record = TelegramToken.query.first()
    if not token_record or not token_record.token:
        return redirect(url_for('set_token'))

    page = request.args.get('page', 1, type=int)
    chat_id = request.args.get('chat_id')
    search_query = request.args.get('search', '')

    # Если чат выбран, помечаем все сообщения этого чата как прочитанные
    if chat_id:
        mark_messages_as_read(chat_id)

    # Строим запрос для получения чатов с учетом поиска
    query = db.session.query(
        TelegramMessage.chat_id,
        TelegramMessage.first_name,
        TelegramMessage.username,
        TelegramMessage.group_name,
        func.max(TelegramMessage.timestamp).label('last_message'),  # Сортируем по последнему сообщению
        func.sum(
            case(
                (TelegramMessage.new == True, 1),  # Если сообщение новое, считаем 1
                else_=0  # Иначе 0
            )
        ).label('unread_count')
    ).filter(TelegramMessage.sender != 'bot')

    if search_query:
        # Фильтруем по запросу (по имени пользователя или названию группы)
        query = query.filter(
            TelegramMessage.first_name.ilike(f'%{search_query}%') |
            TelegramMessage.username.ilike(f'%{search_query}%') |
            TelegramMessage.group_name.ilike(f'%{search_query}%')
        )

    chats = query.group_by(
        TelegramMessage.chat_id,
        TelegramMessage.first_name,
        TelegramMessage.username,
        TelegramMessage.group_name
    ).order_by(func.max(TelegramMessage.timestamp).desc()) \
     .limit(10).offset((page - 1) * 10).all()

    messages = []
    current_chat = None

    if request.method == 'POST':
        chat_id = request.form.get('chat_id')
        text = request.form.get('text', '')      # Текст сообщения (опционально)
        media_path = request.form.get('media_path', '')  # Путь к медиафайлу (опционально)

        # Требуем, чтобы был указан chat_id и хотя бы один из параметров: text или media_path
        if not chat_id or (not text and not media_path):
            return jsonify({'success': False, 'error': 'chat_id и либо text, либо media_path обязательны. Выберите чат.'}), 400

        try:
            # Получаем информацию о текущем пользователе (по chat_id)
            current_chat_user = TelegramMessage.query.filter_by(chat_id=chat_id).first()
            if current_chat_user:
                first_name = current_chat_user.first_name
                username = current_chat_user.username
            else:
                first_name = "Unknown"
                username = "Unknown"

            # Если передан текст, отправляем текстовое сообщение через Telegram API
            if text:
                telegram_bot_instance.send_message(chat_id, text)

            # Сохраняем сообщение (отправленное ботом) в БД с возможным путем к медиафайлу
            new_msg = TelegramMessage(
                chat_id=str(chat_id),
                sender="bot",
                text=text,
                new=False,
                first_name='Вы',
                media_path=media_path if media_path else None
            )
            db.session.add(new_msg)
            db.session.commit()

            # Обновляем сообщения для отображения на странице (пагинация по 20 сообщений)
            messages = TelegramMessage.query.filter_by(chat_id=chat_id)\
                        .order_by(TelegramMessage.timestamp.desc())\
                        .limit(20).offset((page - 1) * 20).all()

            # Используем SortedList для сортировки сообщений в хронологическом порядке (по возрастанию времени)
            sorted_messages = SortedList(messages, key=lambda msg: msg.timestamp)
            messages = list(sorted_messages)

            # Преобразуем сообщения в HTML для отображения (шаблон partial_messages.html)
            messages_html = render_template('partial_messages.html', messages=messages)

            # Возвращаем результат
            return jsonify({'success': True, 'messages_html': messages_html})

        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    # Если chat_id передан, то отображаем его сообщения с пагинацией
    if chat_id:
        messages = TelegramMessage.query.filter_by(chat_id=chat_id)\
                    .order_by(TelegramMessage.timestamp.desc())\
                    .limit(20).offset((page - 1) * 20).all()

        # Используем SortedList для сортировки сообщений в хронологическом порядке (по возрастанию времени)
        sorted_messages = SortedList(messages, key=lambda msg: msg.timestamp)
        messages = list(sorted_messages)

        current_chat = TelegramMessage.query.filter_by(chat_id=chat_id).first()

    if not current_chat:
        current_chat = {}

    return render_template('telegram.html',
                           chats=chats,
                           messages=messages,
                           chat_id=chat_id,
                           current_chat=current_chat,
                           page=page)

# --- AJAX-эндпоинт для загрузки дополнительных чатов ---
@app.route('/load_more_chats', methods=['GET'])
@login_required
@roles_required("user", "admin")
def load_more_chats():
    page = request.args.get('page', 1, type=int)
    chats = db.session.query(
        TelegramMessage.chat_id,
        TelegramMessage.first_name,
        TelegramMessage.username,
        TelegramMessage.group_name,
        db.func.max(TelegramMessage.timestamp).label('last_message')
    ).group_by(TelegramMessage.chat_id)\
     .order_by(db.func.max(TelegramMessage.timestamp).desc())\
     .limit(10).offset((page - 1) * 10).all()
    chats_html = render_template('partial_chats.html', chats=chats)
    return jsonify({'chats_html': chats_html})

# --- AJAX-эндпоинт для обновления сообщений в чате ---
@app.route('/get_new_messages', methods=['GET'])
@login_required
@roles_required("user", "admin")
def get_new_messages():
    chat_id = request.args.get('chat_id')
    last_id = request.args.get('last_id', 0)
    try:
        last_id = int(last_id)
    except ValueError:
        last_id = 0

    new_messages = TelegramMessage.query.filter(
        TelegramMessage.chat_id == chat_id,
        TelegramMessage.id > last_id
    ).order_by(TelegramMessage.timestamp.asc()).all()

    new_messages_html = render_template('partial_messages.html', messages=new_messages)
    return jsonify({'new_messages_html': new_messages_html})

@app.route('/update_chat_list', methods=['GET'])
@login_required
@roles_required("user", "admin")
def update_chat_list():
    # Можно передавать параметр поиска, если он нужен для фильтрации чатов
    search_query = request.args.get('search', '')
    # Если используется пагинация — например, обновляем первую страницу:
    page = request.args.get('page', 1, type=int)

    # Формируем запрос для получения списка чатов
    query = db.session.query(
        TelegramMessage.chat_id,
        TelegramMessage.first_name,
        TelegramMessage.username,
        TelegramMessage.group_name,
        func.max(TelegramMessage.timestamp).label('last_message'),
        func.sum(
            case(
                (TelegramMessage.new == True, 1),
                else_=0
            )
        ).label('unread_count')
    ).filter(TelegramMessage.sender != 'bot')

    if search_query:
        query = query.filter(
            TelegramMessage.first_name.ilike(f'%{search_query}%') |
            TelegramMessage.username.ilike(f'%{search_query}%') |
            TelegramMessage.group_name.ilike(f'%{search_query}%')
        )

    chats = query.group_by(
        TelegramMessage.chat_id,
        TelegramMessage.first_name,
        TelegramMessage.username,
        TelegramMessage.group_name
    ).order_by(func.max(TelegramMessage.timestamp).desc()) \
     .limit(10).offset((page - 1) * 10).all()

    # Рендерим HTML-фрагмент для чатов (partial_chats.html)
    chats_html = render_template('partial_chats.html', chats=chats)

    return jsonify({'chats_html': chats_html})


@app.route('/load_more_messages', methods=['GET'])
@login_required
@roles_required("user", "admin")
def load_more_messages():
    # Получаем chat_id и номер страницы из GET-параметров
    chat_id = request.args.get('chat_id')
    page = request.args.get('page', 1, type=int)
    
    if not chat_id:
        return jsonify({'success': False, 'error': 'Не указан chat_id'}), 400

    try:
        # Запрашиваем 20 сообщений по chat_id.
        # Сообщения выбираются в порядке убывания по timestamp,
        # затем сортируются по возрастанию (хронологически) для корректного отображения.
        messages = (TelegramMessage.query.filter_by(chat_id=chat_id)
                    .order_by(TelegramMessage.timestamp.desc())
                    .limit(20)
                    .offset((page - 1) * 20)
                    .all())

        # Сортировка сообщений по возрастанию времени
        sorted_messages = SortedList(messages, key=lambda msg: msg.timestamp)
        messages = list(sorted_messages)

        # Рендерим HTML-часть для сообщений (используется шаблон partial_messages.html)
        messages_html = render_template('partial_messages.html', messages=messages)

        # Возвращаем JSON с флагом успеха и с отрендеренным HTML
        return jsonify({'success': True, 'old_messages_html': messages_html})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# --- Маршрут для задания/изменения токена ---
@app.route('/set_token', methods=['GET', 'POST'])
@login_required
@roles_required("admin")
def set_token():
    form = SetTokenForm()
    token_record = TelegramToken.query.first()
    current_token = token_record.token if token_record else None

    if form.validate_on_submit():
        new_token = form.token.data.strip()
        if token_record:
            if current_token != new_token:
                if not form.confirm.data:
                    flash("Изменение токена приведет к удалению всей переписки. Поставьте галочку для подтверждения.", "warning")
                    return render_template("set_token.html", form=form, current_token=current_token)
                # Удаляем переписку
                TelegramMessage.query.delete()
                db.session.commit()
                token_record.token = new_token
                db.session.commit()
                flash("Токен обновлён и переписка удалена.", "success")
                stop_telegram_bot()
                time.sleep(1)
                start_telegram_bot(new_token)
            else:
                flash("Токен не изменился.", "info")
        else:
            new_record = TelegramToken(token=new_token)
            db.session.add(new_record)
            db.session.commit()
            flash("Токен сохранён.", "success")
            start_telegram_bot(new_token)
        return redirect(url_for('telegram_interface'))
    return render_template("set_token.html", form=form, current_token=current_token)

def mark_messages_as_read(chat_id):
    """Помечает все новые сообщения в указанном чате как прочитанные."""
    with app.app_context():
        messages = TelegramMessage.query.filter_by(chat_id=chat_id, new=True).all()
        for message in messages:
            message.new = False
        db.session.commit()

# Папка для сохранения скачанных файлов
DOWNLOAD_FOLDER = os.path.join(os.getcwd(), 'telegram', 'download')
if not os.path.exists(DOWNLOAD_FOLDER):
    os.makedirs(DOWNLOAD_FOLDER)


def secure_filename_unicode(filename):
    """
    Функция для безопасного использования имени файла,
    которая сохраняет Unicode-символы и удаляет опасные символы.
    """
    # Убираем путь, оставляем только имя файла
    filename = os.path.basename(filename)
    # Удаляем непечатаемые символы
    filename = ''.join(ch for ch in filename if ch.isprintable())
    # Заменяем пробелы на подчеркивания
    filename = filename.replace(' ', '_')
    # Удаляем символы, запрещённые в Windows: \ / : * ? " < > |
    filename = re.sub(r'[\\\/:*?"<>|]', '', filename)
    # Удаляем лишние точки или подчеркивания в начале и конце
    filename = filename.strip('._')
    if not filename:
        filename = 'file'
    # Ограничиваем длину имени файла (например, до 255 символов)
    return filename[:255]

@app.route('/telegram_upload', methods=['POST'])
@login_required
@roles_required("user", "admin")
def telegram_upload():
    """
    Загружает медиафайл, отправляет его через Telegram API выбранному чату
    и сохраняет сообщение (с указанием media_path) в базе данных.
    """
    chat_id = request.form.get('chat_id')
    if not chat_id:
        return jsonify({'success': False, 'error': 'Параметр chat_id обязателен.'}), 400

    file = request.files.get('media')
    if not file:
        return jsonify({'success': False, 'error': 'Файл не был передан.'}), 400

    # Папка для загрузки файлов (telegram/upload)
    upload_folder = os.path.join('telegram', 'upload')
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)

    # Используем нашу функцию для безопасного имени файла с поддержкой Unicode
    filename = secure_filename_unicode(file.filename)
    file_path = os.path.join(upload_folder, filename)
    
    try:
        file.save(file_path)
    except Exception as e:
        return jsonify({'success': False, 'error': 'Ошибка сохранения файла: ' + str(e)}), 500

    # Определяем, как отправлять файл: если это изображение, отправляем как фото, иначе как документ.
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    try:
        if ext in ['jpg', 'jpeg', 'png', 'gif']:
            with open(file_path, 'rb') as f:
                sent_msg = telegram_bot_instance.send_photo(chat_id, f)
        else:
            with open(file_path, 'rb') as f:
                sent_msg = telegram_bot_instance.send_document(chat_id, f)
    except Exception as e:
        return jsonify({'success': False, 'error': 'Ошибка отправки файла: ' + str(e)}), 500

    # Опционально: получаем подпись (caption) из формы, если она передана
    caption = request.form.get('text', '')

    # Сохраняем сообщение (отправленное ботом) в БД, указывая путь к загруженному файлу
    new_msg = TelegramMessage(
        chat_id=str(chat_id),
        sender="bot",
        text=caption,
        group_name=None,
        username='',
        first_name='Вы',
        new=False,
        media_path=file_path
    )
    db.session.add(new_msg)
    db.session.commit()

    # Получаем обновленные сообщения для данного чата для отображения (пагинация по 20 сообщений)
    page = 1
    messages = TelegramMessage.query.filter_by(chat_id=chat_id)\
                .order_by(TelegramMessage.timestamp.desc())\
                .limit(20).offset((page - 1) * 20).all()
    # Сортируем в хронологическом порядке (по возрастанию времени)
    sorted_messages = SortedList(messages, key=lambda msg: msg.timestamp)
    messages = list(sorted_messages)
    messages_html = render_template('partial_messages.html', messages=messages)
    return jsonify({'success': True, 'messages_html': messages_html})

# Эндпоинт для отдачи файлов из папки telegram
@app.route('/telegram/<path:filename>', methods=['GET'])
def serve_telegram_file(filename):
    # Базовая директория для файлов
    base_dir = os.path.join(os.getcwd(), 'telegram')
    # Формируем полный путь к файлу
    file_path = os.path.join(base_dir, filename)
    
    # Если запрошенный файл не существует или это директория, возвращаем 404
    if not os.path.exists(file_path) or os.path.isdir(file_path):
        abort(404)
    
    # Отдаём файл из соответствующей директории.
    # as_attachment=False — файл будет открыт inline (если браузер умеет его отображать)
    directory = os.path.dirname(file_path)
    file_name = os.path.basename(file_path)
    return send_from_directory(directory, file_name, as_attachment=False)

# Эндпоинт для отдачи файлов из папки files
@app.route('/files/<path:filename>', methods=['GET'])
def serve_files(filename):
    # Базовая директория для файлов
    base_dir = os.path.join(os.getcwd(), 'templates', 'files')
    # Формируем полный путь к файлу
    file_path = os.path.join(base_dir, filename)
    
    # Если запрошенный файл не существует или это директория, возвращаем 404
    if not os.path.exists(file_path) or os.path.isdir(file_path):
        abort(404)
    
    # Отдаём файл из соответствующей директории.
    # as_attachment=False — файл будет открыт inline (если браузер умеет его отображать)
    directory = os.path.dirname(file_path)
    file_name = os.path.basename(file_path)
    return send_from_directory(directory, file_name, as_attachment=False)


@app.route('/telegram_broadcast', methods=['POST'])
@login_required
@roles_required("user", "admin")
def telegram_broadcast():
    text = request.form.get('text', '')
    
    # Обработка файла (если он передан)
    file = request.files.get('media')
    file_path = None
    ext = ''
    if file:
        upload_folder = os.path.join('telegram', 'upload')
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)
        filename = secure_filename_unicode(file.filename)
        file_path = os.path.join(upload_folder, filename)
        try:
            file.save(file_path)
        except Exception as e:
            flash('Ошибка сохранения файла: ' + str(e), 'error')
            return redirect(url_for('broadcast'))
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    
    # Извлекаем из базы данных все сообщения и формируем уникальный список chat_id с first_name
    messages = TelegramMessage.query.all()
    unique_chats = {}
    for msg in messages:
        if msg.chat_id not in unique_chats:
            unique_chats[msg.chat_id] = msg.first_name or ''
    
    # Проходим по каждому уникальному чату и отправляем сообщение,
    # заменяя в тексте шаблон [first_name] на конкретное имя получателя.
    for chat_id, first_name in unique_chats.items():
        try:
            personalized_text = text.replace("[first_name]", first_name)
            if file_path:
                # Если передан файл – определяем, отправлять как фото или документ
                if ext in ['jpg', 'jpeg', 'png', 'gif']:
                    with open(file_path, 'rb') as f:
                        telegram_bot_instance.send_photo(chat_id, f, caption=personalized_text)
                else:
                    with open(file_path, 'rb') as f:
                        telegram_bot_instance.send_document(chat_id, f, caption=personalized_text)
            else:
                telegram_bot_instance.send_message(chat_id, personalized_text)
            
            # Сохраняем отправленное сообщение в базе данных для каждого чата
            new_msg = TelegramMessage(
                chat_id=str(chat_id),
                sender="bot",
                text=personalized_text,
                group_name=None,
                username='',
                first_name='Рассылка',
                new=False,
                media_path=file_path  # Если файла нет, здесь будет None
            )
            db.session.add(new_msg)
        except Exception as e:
            # Здесь можно логировать ошибки для каждого чата, если необходимо
            print(f"Ошибка при отправке для {chat_id}: {e}")
    
    db.session.commit()
    flash("Рассылка выполнена успешно!", "success")
    return redirect(url_for('broadcast'))


@app.route('/broadcast', methods=['GET'])
@login_required
@roles_required("user", "admin")
def broadcast():
    return render_template('broadcast.html')

from flask_wtf import FlaskForm
from wtforms import StringField, TextAreaField, SubmitField
from wtforms.validators import DataRequired
class TelegramScriptForm(FlaskForm):
    keyword = StringField('Ключевое слово', validators=[DataRequired()])
    code = TextAreaField('Код скрипта', validators=[DataRequired()])
    description = StringField('Описание')
    submit = SubmitField('Сохранить скрипт')

@app.route('/telegram_scripts', methods=['GET', 'POST'])
@login_required
@roles_required("admin")
def telegram_scripts():
    # Здесь предполагается, что доступ к маршруту имеют только авторизованные пользователи
    form = TelegramScriptForm()
    
    # Обработка добавления нового скрипта
    if form.validate_on_submit():
        new_script = TelegramScript(
            keyword=form.keyword.data,
            code=form.code.data,
            description=form.description.data
        )
        db.session.add(new_script)
        db.session.commit()
        flash("Скрипт успешно добавлен!", "success")
        return redirect(url_for('telegram_scripts'))

    # Обработка удаления скрипта
    if request.method == 'POST' and 'delete' in request.form:
        script_id = request.form['delete']
        script_to_delete = TelegramScript.query.get(script_id)
        if script_to_delete:
            db.session.delete(script_to_delete)
            db.session.commit()
            flash("Скрипт успешно удален!", "success")
        return redirect(url_for('telegram_scripts'))
    
    # Получаем все скрипты для отображения
    scripts = TelegramScript.query.order_by(TelegramScript.id.desc()).all()
    return render_template('telegram_scripts.html', form=form, scripts=scripts)


@app.route('/telegram_upload_second', methods=['POST'])
@login_required
@roles_required("user", "admin")
def telegram_upload_second():
    """
    Загружает медиафайл и возвращает путь к нему.
    """
    file = request.files.get('media')
    if not file:
        return jsonify({'success': False, 'error': 'Файл не был передан.'}), 400

    # Папка для загрузки файлов (telegram/upload)
    upload_folder = os.path.join('telegram', 'upload')
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)

    # Используем функцию для безопасного имени файла с поддержкой Unicode
    filename = secure_filename_unicode(file.filename)
    file_path = os.path.join(upload_folder, filename)

    try:
        file.save(file_path)
    except Exception as e:
        return jsonify({'success': False, 'error': 'Ошибка сохранения файла: ' + str(e)}), 500

    return jsonify({'success': True, 'file_path': file_path})

# ------------------- Общий доступ  -------------------

# Новая модель для хранения информации об общем доступе к проекту
class SharedProject(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    share_id = db.Column(db.String(100), unique=True, nullable=False)  # Идентификатор доступа, задаётся пользователем
    project_path = db.Column(db.String(200), nullable=False)  # Абсолютный путь к файлу проекта


@app.route('/open/<share_id>', methods=['GET'])
def open_shared_project(share_id):
    shared = SharedProject.query.filter_by(share_id=share_id).first()
    if shared:
        if os.path.exists(shared.project_path):
            try:
                with open(shared.project_path, 'r', encoding='utf-8') as f:
                    project_content = f.read()
                # Рендерим шаблон без панели инструментов и списка проектов
                return render_template('shared_project.html', project_content=project_content)
            except Exception as e:
                return render_template('error.html', error=str(e)), 500
        else:
            return render_template('error.html', error='Файл проекта не найден'), 404
    else:
        return render_template('error.html', error='Общий доступ для данного идентификатора не найден. Выберите проект для общего доступа.'), 404


@app.route('/access', methods=['GET', 'POST', 'DELETE'])
@login_required
@roles_required("user", "admin")
def manage_access():
    # Определяем имя проекта в зависимости от типа запроса:
    if request.method == 'GET':
        project_name = request.args.get('project_name')
    else:
        # Для POST и DELETE пытаемся получить данные в формате JSON,
        # если не JSON, то из form-данных.
        data = request.get_json() if request.is_json else request.form
        project_name = data.get('project_name')
    
    if not project_name:
        return jsonify({'success': False, 'error': 'Необходимо указать название проекта (project_name)'})
    
    project_file = os.path.join(PROJECTS_DIR, project_name, 'index.html')
    if not os.path.exists(project_file):
        return jsonify({'success': False, 'error': 'Проект не найден'})
    
    if request.method == 'GET':
        # Проверяем, открыт ли проект для общего доступа
        shared = SharedProject.query.filter_by(project_path=project_file).first()
        if shared:
            share_url = url_for('open_shared_project', share_id=shared.share_id, _external=True)
            return jsonify({'success': True, 'access': True, 'share_url': share_url})
        else:
            return jsonify({
                'success': True,
                'access': False,
                'message': 'Проект не открыт для общего доступа. Укажите share_id для открытия доступа.'
            })
    
    elif request.method == 'POST':
        # Получаем данные из запроса (ожидается JSON)
        data = request.get_json() if request.is_json else request.form
        share_id = data.get('share_id')
        if not share_id:
            return jsonify({'success': False, 'error': 'Необходимо указать share_id'})
        
        # Проверяем, не используется ли уже данный share_id
        if SharedProject.query.filter_by(share_id=share_id).first():
            return jsonify({'success': False, 'error': 'Данный share_id уже используется'})
        
        new_shared = SharedProject(share_id=share_id, project_path=project_file)
        db.session.add(new_shared)
        db.session.commit()
        share_url = url_for('open_shared_project', share_id=share_id, _external=True)
        return jsonify({'success': True, 'message': 'Доступ открыт', 'share_url': share_url})
    
    elif request.method == 'DELETE':
        # Отзыв общего доступа – удаляем запись из базы
        shared = SharedProject.query.filter_by(project_path=project_file).first()
        if not shared:
            return jsonify({'success': False, 'error': 'Общий доступ для данного проекта не найден'})
        db.session.delete(shared)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Общий доступ закрыт'})

@app.route('/get_project_name/<share_id>', methods=['GET'])
def get_project_name(share_id):
    shared = SharedProject.query.filter_by(share_id=share_id).first()
    if shared:
        # Получаем имя проекта из пути
        project_name = os.path.basename(os.path.dirname(shared.project_path))
        return jsonify({'success': True, 'project_name': project_name})
    else:
        return jsonify({'success': False, 'error': 'Общий доступ для данного идентификатора не найден'}), 404

@app.route('/telegram_treker', methods=['GET'])
@login_required
def telegram_treker():
    query = request.args.get('q', '').strip()
    if query:
        users = TelegramMessage.query.filter(TelegramMessage.first_name.ilike(f"%{query}%"))\
                .with_entities(TelegramMessage.first_name, TelegramMessage.chat_id)\
                .distinct().all()
    else:
        users = []
    user_list = [{'first_name': u[0], 'chat_id': u[1]} for u in users]
    return jsonify(success=True, users=user_list)

@app.route('/telegram_task_notify', methods=['POST'])
@login_required
@roles_required("user", "admin")
def telegram_task_notify():
    """
    Отправляет уведомление о смене статуса задачи в Telegram чат(ы) и сохраняет сообщение в БД.
    """
    # Получаем список chat_id
    chat_ids = request.form.getlist('chat_ids')
    if not chat_ids:
        return jsonify({'success': False, 'error': 'Параметр chat_ids обязателен.'}), 400

    project_name = request.form.get('project_name', '').strip()
    task_name = request.form.get('task_name', '').strip()
    task_status = request.form.get('task_status', '').strip()
    
    if not project_name or not task_name or not task_status:
        return jsonify({
            'success': False,
            'error': 'Необходимо указать название проекта, задачи и статус задачи.'
        }), 400

    # Формируем красиво отформатированное сообщение (Markdown-разметка)
    message_text = f"{project_name}\n\nЗадача: {task_name}: *{task_status}*."

    # Обработка медиафайла (если передан)
    file = request.files.get('media')
    media_path = None
    if file:
        upload_folder = os.path.join('telegram', 'upload')
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)
        # Безопасное имя файла с поддержкой Unicode
        filename = secure_filename_unicode(file.filename)
        media_path = os.path.join(upload_folder, filename)
        try:
            file.save(media_path)
        except Exception as e:
            return jsonify({'success': False, 'error': 'Ошибка сохранения файла: ' + str(e)}), 500
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

    results = []
    # Отправка уведомления для каждого chat_id
    for chat_id in chat_ids:
        try:
            if file:
                with open(media_path, 'rb') as f:
                    if ext in ['jpg', 'jpeg', 'png', 'gif']:
                        sent_msg = telegram_bot_instance.send_photo(
                            chat_id, 
                            f, 
                            caption=message_text,
                            parse_mode='Markdown'
                        )
                    else:
                        sent_msg = telegram_bot_instance.send_document(
                            chat_id, 
                            f, 
                            caption=message_text,
                            parse_mode='Markdown'
                        )
            else:
                sent_msg = telegram_bot_instance.send_message(
                    chat_id, 
                    message_text,
                    parse_mode='Markdown'
                )
            
            # Сохраняем отправленное сообщение в базе данных
            new_msg = TelegramMessage(
                chat_id=str(chat_id),
                sender="bot",
                text=message_text,
                group_name=None,
                username='',
                first_name='Вы',
                new=False,
                media_path=media_path
            )
            db.session.add(new_msg)
            results.append({'chat_id': chat_id, 'status': 'sent'})
        except Exception as e:
            results.append({'chat_id': chat_id, 'error': str(e)})
    db.session.commit()
    
    return jsonify({'success': True, 'results': results})

@app.route('/telegram_send', methods=['POST'])
@login_required
@roles_required("user", "admin")
def telegram_send():
    """
    Отправляет сообщение (с текстом и/или фото) пользователю и сохраняет сообщение в БД.
    """
    # Получаем список chat_id
    chat_ids = request.form.getlist('chat_ids')
    if not chat_ids:
        return jsonify({'success': False, 'error': 'Параметр chat_ids обязателен.'}), 400

    message_text = request.form.get('message_text', '').strip()
    if not message_text:
        return jsonify({'success': False, 'error': 'Необходимо указать текст сообщения.'}), 400

    # Обработка медиафайла (если передан)
    files = request.files.getlist('media')
    media_paths = []
    if files:
        upload_folder = os.path.join('telegram', 'upload')
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)
        
        for file in files:
            filename = secure_filename_unicode(file.filename)
            file_path = os.path.join(upload_folder, filename)
            try:
                file.save(file_path)
                media_paths.append(file_path)
            except Exception as e:
                return jsonify({'success': False, 'error': 'Ошибка сохранения файла: ' + str(e)}), 500

    results = []
    for chat_id in chat_ids:
        try:
            # Отправка сообщения с медиафайлом или без
            if media_paths:
                for media_path in media_paths:
                    with open(media_path, 'rb') as f:
                        if media_path.endswith(('.jpg', '.jpeg', '.png', '.gif')):  # Если это изображение
                            telegram_bot_instance.send_photo(chat_id, f, caption=message_text)
                        else:  # Если это документ
                            telegram_bot_instance.send_document(chat_id, f, caption=message_text)
            else:
                # Если нет файла, отправляем только текст
                telegram_bot_instance.send_message(chat_id, message_text)

            # Сохраняем сообщение в БД
            new_msg = TelegramMessage(
                chat_id=str(chat_id),
                sender="bot",
                text=message_text,
                new=False,
                media_path=','.join(media_paths)  # Если файлы были, сохраняем их пути
            )
            db.session.add(new_msg)
            results.append({'chat_id': chat_id, 'status': 'sent'})
        except Exception as e:
            results.append({'chat_id': chat_id, 'error': str(e)})

    db.session.commit()

    return jsonify({'success': True, 'results': results})


# ------------------- Запуск приложения -------------------
# Функция для проверки лицензии
def check_license():
    try:
        with open("key.json", "r") as file:
            data = json.load(file)
            license_key = data.get("license_key")
            
            if not license_key:
                print("Файл key.json не содержит ключ лицензии.")
                return False
            
            url = f"https://app.sheb.cloud/check?license_key={license_key}"
            response = requests.get(url)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("valid"):
                    return True
                else:
                    print("Либо ключ не действителен, либо у вас подписка закончилась.")
                    return False
            else:
                print("Ошибка при проверке лицензии. Сервер недоступен или вернул ошибку.")
                return False
    except Exception as e:
        print(f"Ошибка при чтении key.json: {e}")
        return False


if __name__ == '__main__':
    if check_license():
        with app.app_context():
            db.create_all()
            if not User.query.filter_by(username="Mansur").first():
                admin_user = User(username="Mansur", password="alfons@23", role="admin")
                db.session.add(admin_user)
                db.session.commit()
            
            # Если в БД есть сохранённый токен, запускаем телеграм-бота
            token_record = TelegramToken.query.first()
            if token_record and token_record.token:
                start_telegram_bot(token_record.token)
            
        app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)
    else:
        exit(1)

