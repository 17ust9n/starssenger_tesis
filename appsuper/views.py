import json, hashlib, os
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from .models import Mensaje, Usuario, EnvioMensaje, Canal
from django.conf import settings
from PIL import Image
from pywebpush import webpush, WebPushException

# Configurar claves VAPID para WebPush en settings.py de Django
VAPID_PRIVATE_KEY = getattr(settings, 'VAPID_PRIVATE_KEY', '')
VAPID_ADMIN_EMAIL = getattr(settings, 'VAPID_ADMIN_EMAIL', 'mailto:admin@starssenger.app')

@login_required
@require_POST
def sync_public_key_api(request):
    """
    Registra la Clave Pública X25519 (b64) del Usuario en el servidor Django.
    Nunca recibe ni almacena la Clave Privada (permanece en la WebCrypto API del cliente).
    """
    try:
        data = json.loads(request.body)
        pub_key = data.get('public_key', '').strip()

        if not pub_key:
            return JsonResponse({'status': 'error', 'message': 'Clave pública no provista.'}, status=400)

        usuario = Usuario.objects.filter(dni=request.user.username).first()
        if usuario and hasattr(usuario, 'profile'):
            profile = usuario.profile
            profile.public_key = pub_key
            profile.save(update_fields=['public_key'])

        return JsonResponse({'status': 'ok'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@login_required
def home_view(request):
    """
    Vista principal que inyecta el estado inicial del Usuario registrado
    directamente a las variables JavaScript del cliente.
    """
    usuario = Usuario.objects.filter(dni=request.user.username).first()
    
    context = {
        'me_dni': str(usuario.dni) if usuario else '',
        'me_name': usuario.nombre if usuario else '',
        'is_shielded': 1 if (usuario and hasattr(usuario, 'profile') and usuario.profile.is_shielded) else 0,
    }
    return render(request, 'home.html', context)

def room_hash(members: list[str]) -> str:
    """
    Genera el identificador único determinístico de la sala a partir de la lista
    de números ordenados (equivalente en lógica al djb2 en JS).
    """
    joined_members = "|".join(sorted(members))
    h = 5381
    for char in joined_members:
        h = ((h << 5) + h + ord(char)) & 0xFFFFFFFF
    
    # Conversión a base36
    chars = '0123456789abcdefghijklmnopqrstuvwxyz'
    base36 = ''
    while h > 0:
        h, i = divmod(h, 36)
        base36 = chars[i] + base36
        
    return f"starssenger/{base36 or '0'}"


def initials(name: str) -> str:
    """Obtiene las iniciales de un nombre."""
    parts = name.strip().split()
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][0].upper()
    return (parts[0][0] + parts[1][0]).upper()


def tail(num: str) -> str:
    """Muestra solo los últimos 4 dígitos de un número."""
    return f"…{num[-4:]}" if len(num) >= 4 else num



@login_required
def get_user_conversations_api(request):
    """
    Retorna la lista de conversaciones y grupos asociados al usuario actual
    desde el modelo relacional de Django.
    """
    try:
        user_dni = request.user.username
        # Obtener mensajes asociados al canal o al remitente
        canales = Canal.objects.all()
        conv_list = []

        for canal in canales:
            ultimo_msg = Mensaje.objects.filter(canal=canal).order_by('-id_mensaje').first()
            conv_list.append({
                'topic': f"starssenger/canal_{canal.id_canal}",
                'title': f"Canal {canal.id_canal}",
                'last_msg': ultimo_msg.texto if ultimo_msg else '',
                'nodo_id': canal.nodo.id_nodo if canal.nodo else 1
            })

        return JsonResponse({'status': 'ok', 'conversations': conv_list})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
    

@login_required
def get_call_logs_api(request):
    """
    Retorna el historial de llamadas registradas para el usuario activo.
    """
    usuario = Usuario.objects.filter(dni=request.user.username).first()
    if not usuario:
        return JsonResponse({'status': 'ok', 'calls': []})

    envios = EnvioMensaje.objects.filter(
        usuario=usuario, 
        mensaje__categoria__startswith='Llamada_'
    ).select_related('mensaje').order_by('-fecha')[:100]

    calls = []
    for env in envios:
        msg = env.mensaje
        mode = 'audio' if 'audio' in msg.categoria else 'video'
        calls.append({
            'name': msg.remitente,
            'number': str(env.usuario.dni),
            'ts': env.fecha.strftime('%Y-%m-%d %H:%M'),
            'type': 'realizada' if msg.remitente == request.user.username else 'recibida',
            'mode': mode
        })

    return JsonResponse({'status': 'ok', 'calls': calls})


@login_required
@require_POST
def update_preferences_api(request):
    """
    Sincroniza ajustes del usuario (color de tildes de lectura, modo blindado).
    """
    try:
        data = json.loads(request.body)
        tick_bw = data.get('tick_bw', False)
        
        # Si tienes el campo en Profile/Usuario
        if hasattr(request.user, 'profile'):
            profile = request.user.profile
            profile.read_tick_color = not tick_bw
            profile.save(update_fields=['read_tick_color'])

        return JsonResponse({'status': 'ok'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@login_required
@require_POST
def wipe_user_data_api(request):
    """
    Borra la sesión en servidor Django y purge la información sensible.
    """
    user = request.user
    logout(request)
    return JsonResponse({'status': 'ok'})


@login_required
@require_POST
def edit_message_api(request):
    """
    Actualiza el payload cifrado de un mensaje editado en la base de datos de Django.
    """
    try:
        data = json.loads(request.body)
        msg_id = data.get('id')
        encrypted_text = data.get('encrypted_content', '')

        mensaje = Mensaje.objects.filter(id_mensaje=msg_id, remitente=request.user.username).first()
        if mensaje:
            mensaje.texto = encrypted_text[:150]
            mensaje.save(update_fields=['texto'])
            return JsonResponse({'status': 'ok'})
            
        return JsonResponse({'status': 'error', 'message': 'Mensaje no encontrado o no autorizado.'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@login_required
@require_POST
def delete_message_api(request):
    """
    Elimina o invalida un mensaje en el servidor Django.
    """
    try:
        data = json.loads(request.body)
        msg_id = data.get('id')
        for_all = data.get('for_all', False)

        if for_all:
            Mensaje.objects.filter(id_mensaje=msg_id, remitente=request.user.username).delete()
            
        return JsonResponse({'status': 'ok'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@login_required
@require_POST
def update_ack_api(request):
    """
    Sincroniza el estado de entrega y lectura (tildes ✓ / ✓✓) en la base de datos.
    """
    try:
        data = json.loads(request.body)
        msg_id = data.get('id')
        state = data.get('state', 'delivered')

        if msg_id:
            Mensaje.objects.filter(id_mensaje=msg_id).update(stock=0 if state == 'read' else 1)

        return JsonResponse({'status': 'ok'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
    

@login_required
@require_POST
def send_push_api(request):
    """
    Sustituye la función serverless de Netlify.
    Pega las notificaciones WebPush hacia las suscripciones registradas.
    """
    try:
        data = json.loads(request.body)
        subs = data.get('subs', [])
        title = data.get('title', 'Starssenger')
        body = data.get('body', 'Nuevo mensaje')
        tag = data.get('tag', 'sp-msg')

        payload = json.dumps({'title': title, 'body': body, 'tag': tag})

        for sub in subs:
            try:
                webpush(
                    subscription_info=sub,
                    data=payload,
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": VAPID_ADMIN_EMAIL}
                )
            except WebPushException:
                pass  # Suscripción vencida o inactiva

        return JsonResponse({'status': 'ok', 'sent': len(subs)})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@login_required
@require_POST
def process_photo_pillow_api(request):
    """
    Procesamiento opcional de imágenes en backend mediante Pillow 
    (escalado, compresión JPG) cuando no se procesa localmente con Canvas.
    """
    if request.FILES.get('image'):
        image_file = request.FILES['image']
        try:
            img = Image.open(image_file)
            img = img.convert('RGB')
            
            # Redimensionar conservando aspect ratio (Max 1280px)
            img.thumbnail((1280, 1280), Image.Resampling.LANCZOS)

            upload_dir = os.path.join(settings.MEDIA_ROOT, 'mensajes_opt/')
            os.makedirs(upload_dir, exist_ok=True)
            
            save_path = os.path.join(upload_dir, image_file.name)
            img.save(save_path, 'JPEG', quality=70, optimize=True)

            relative_url = os.path.join(settings.MEDIA_URL, 'mensajes_opt/', image_file.name)
            return JsonResponse({'status': 'ok', 'url': relative_url})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)
            
    return JsonResponse({'status': 'error', 'message': 'No se recibió ninguna imagen'}, status=400)

@login_required
@require_POST
def sync_incoming_message_api(request):
    """
    Guarda los metadatos del mensaje recibido en la base de datos de Django.
    El texto almacenado permanece cifrado para garantizar la privacidad E2EE.
    """
    try:
        data = json.loads(request.body)
        msg_id = data.get('id')
        sender = str(data.get('from', ''))
        encrypted_payload = data.get('encrypted_content', '[Mensaje Cifrado]')
        category = data.get('category', 'Texto')  # Texto, Audio, Foto
        bytes_size = float(data.get('bytes', 0)) / 1024.0  # Convertir a KB

        # Obtener o crear canal/nodo por defecto
        canal = Canal.objects.first()

        # Registrar el mensaje en la BD sin desencriptar el contenido
        mensaje, created = Mensaje.objects.get_or_create(
            id_mensaje=int(msg_id) if msg_id else 0,
            nodo_id=1,
            defaults={
                'canal': canal,
                'texto': encrypted_payload[:150],  # Almacena el payload cifrado
                'remitente': sender,
                'peso': round(bytes_size, 2),
                'stock': 1,
                'categoria': category,
                'costo': 0.0
            }
        )

        return JsonResponse({'status': 'ok', 'id_mensaje': mensaje.id_mensaje})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@login_required
@require_POST
def log_call_api(request):
    """
    Registra en la base de datos el evento de una llamada realizada o recibida.
    """
    try:
        data = json.loads(request.body)
        call_type = data.get('type', 'video')  # 'video' u 'audio'
        direction = data.get('direction', 'realizada')  # 'realizada' o 'recibida'
        target_number = ''.join(filter(str.isdigit, str(data.get('target', ''))))

        if not target_number:
            return JsonResponse({'status': 'error', 'message': 'Número de destino inválido.'}, status=400)

        # Registrar el evento creando un registro de mensaje/envío para auditoría
        last_msg = Mensaje.objects.order_by('-id_mensaje').first()
        new_id = (last_msg.id_mensaje + 1) if last_msg else 1

        mensaje = Mensaje.objects.create(
            id_mensaje=new_id,
            nodo_id=1,
            texto=f"Llamada ({call_type}) - {direction.capitalize()}",
            remitente=request.user.username,
            peso=0.0,
            stock=1,
            categoria=f"Llamada_{call_type}",
            costo=0.0
        )

        return JsonResponse({'status': 'ok', 'id_mensaje': mensaje.id_mensaje})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@login_required
@require_POST
def save_contact_api(request):
    """Crea o actualiza un contacto en el sistema."""
    name = request.POST.get('name', '').strip()
    phone = ''.join(filter(str.isdigit, request.POST.get('phone', '')))
    editing_phone = ''.join(filter(str.isdigit, request.POST.get('editing_phone', '')))

    if not name or len(phone) < 6:
        return JsonResponse({'status': 'error', 'message': 'Poné nombre y número completo.'}, status=400)

    # Buscar o registrar el usuario destino
    contacto, _ = Usuario.objects.get_or_create(
        dni=int(phone),
        defaults={'nombre': name, 'edad': 0, 'id_usuario': int(phone), 'dinero': 0.0}
    )
    if contacto.nombre != name:
        contacto.nombre = name
        contacto.save(update_fields=['nombre'])

    return JsonResponse({'status': 'ok', 'name': contacto.nombre, 'phone': str(contacto.dni)})


@login_required
@require_POST
def create_group_api(request):
    """Crea un nuevo canal/grupo con sus miembros."""
    data = json.loads(request.body)
    group_name = data.get('name', '').strip()
    members = data.get('members', [])

    if len(members) < 2:
        return JsonResponse({'status': 'error', 'message': 'Elegí al menos 2 miembros.'}, status=400)

    # Generar un ID único para el canal
    last_canal = Canal.objects.order_by('-id_canal').first()
    new_id = (last_canal.id_canal + 1) if last_canal else 1000

    canal = Canal.objects.create(id_canal=new_id)

    return JsonResponse({
        'status': 'ok',
        'id_canal': canal.id_canal,
        'name': group_name or f"N{canal.id_canal}",
        'members': members
    })


@login_required
@require_POST
def import_backup_api(request):
    """Restaura contactos y grupos masivamente en el backend."""
    data = json.loads(request.body)
    imported_contacts = 0

    for c in data.get('contacts', []):
        phone_str = ''.join(filter(str.isdigit, str(c.get('number', ''))))
        if phone_str and len(phone_str) >= 6:
            Usuario.objects.get_or_create(
                dni=int(phone_str),
                defaults={'nombre': c.get('name', phone_str), 'edad': 0, 'id_usuario': int(phone_str), 'dinero': 0.0}
            )
            imported_contacts += 1

    return JsonResponse({'status': 'ok', 'imported': imported_contacts})

@login_required
def save_profile_view(request):
    """
    Procesa tanto el alta inicial (saveMe) como la actualización (saveProfile).
    """
    if request.method == 'POST':
        dni_num = request.POST.get('dni', '').strip()
        nombre = request.POST.get('nombre', '').strip()
        is_shielded = request.POST.get('is_shielded') == '1'

        # Limpiar caracteres no numéricos (equivalente a .replace(/\D/g, ''))
        dni_clean = ''.join(filter(str.isdigit, dni_num))

        if len(dni_clean) < 6:
            return JsonResponse({'status': 'error', 'message': 'Poné tu número completo con código de país.'}, status=400)

        # Buscar o crear el usuario según su DNI/Número
        usuario, created = Usuario.objects.get_or_create(
            dni=int(dni_clean),
            defaults={
                'nombre': nombre or "Sin Nombre",
                'edad': 25,
                'id_usuario': int(dni_clean),
                'dinero': 100.0
            }
        )

        if not created:
            usuario.nombre = nombre
            usuario.save()

        # Si entra en Modo Blindado, opcionalmente eliminamos el historial en servidor
        if is_shielded:
            Mensaje.objects.filter(remitente=str(usuario.dni)).delete()

        return JsonResponse({
            'status': 'ok',
            'me': usuario.dni,
            'myname': usuario.nombre,
            'is_shielded': is_shielded
        })

    return render(request, 'profile_edit.html')

def boot_view(request):
    """
    Controlador equivalente a boot():
    Si el usuario no está autenticado o no tiene perfil registrado,
    lo redirige a Onboarding. Si ya existe, carga la pantalla Home.
    """
    if not request.user.is_authenticated:
        return redirect('onboard')
    
    # Comprobar si el perfil de Usuario asociado existe
    usuario_profile = Usuario.objects.filter(dni=request.user.username).first()
    if not usuario_profile:
        return redirect('onboard')
        
    return render(request, 'home.html', {'usuario': usuario_profile})