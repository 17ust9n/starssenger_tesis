from django.db import models
from django.core.validators import MinValueValidator

class Plataforma(models.Model):
    ano_fundacion = models.IntegerField()
    cant_nodos = models.IntegerField()
    pais = models.CharField(max_length=100)

    def __str__(self):
        return f"Plataforma {self.pais}"


class Nodo(models.Model):
    plataforma = models.ForeignKey(Plataforma, on_delete=models.CASCADE, related_name='nodos')
    nombre = models.CharField(max_length=150, default="Nodo Principal")
    domicilio = models.CharField(max_length=200, default="Servidor Central")
    localidad = models.CharField(max_length=150)
    id_nodo = models.IntegerField(unique=True)

    def __str__(self):
        # Corregido: String en una sola línea con salto explícito \n
        return f"{self.nombre}\n{self.localidad} ({self.id_nodo})"


class Administrador(models.Model):
    nodo = models.ForeignKey(Nodo, on_delete=models.CASCADE, related_name='administradores')
    edad = models.IntegerField()
    anos_servicio = models.IntegerField()
    dni = models.IntegerField(unique=True)

    def __str__(self):
        return f"Administrador DNI: {self.dni}"


class Moderador(models.Model):
    nodo = models.ForeignKey(Nodo, on_delete=models.CASCADE, related_name='moderadores')
    nombre = models.CharField(max_length=150, default="Sin Nombre")
    sexo = models.CharField(max_length=10, default="hombre") 
    edad = models.IntegerField()
    anos_servicio = models.IntegerField()
    dni = models.IntegerField(unique=True)
    id_moderador = models.IntegerField(unique=True)
    sueldo = models.FloatField()

    def __str__(self):
        return f"{self.nombre} (ID: {self.id_moderador})"


class Canal(models.Model):
    nodo = models.ForeignKey(Nodo, on_delete=models.CASCADE, related_name='canales')
    id_canal = models.IntegerField(unique=True)

    def __str__(self):
        return f"Canal {self.id_canal}"


class Mensaje(models.Model):
    canal = models.ForeignKey('Canal', on_delete=models.SET_NULL, null=True, blank=True, related_name='mensajes')
    id_mensaje = models.IntegerField()
    nodo_id = models.IntegerField(default=1) 
    texto = models.CharField(max_length=150)
    remitente = models.CharField(max_length=150)
    peso = models.FloatField(validators=[MinValueValidator(0.0)])  # Tamaño en KB
    stock = models.IntegerField(validators=[MinValueValidator(1)])  # Intentos/TTL
    categoria = models.CharField(max_length=100)                    # Cifrado, Multimedia, etc.
    costo = models.FloatField()
    imagen = models.ImageField(upload_to='mensajes/', null=True, blank=True)

    mensaje_padre = models.ForeignKey(
        'self', 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        related_name='respuestas'
    )

    class Meta:
        unique_together = ('id_mensaje', 'nodo_id') 

    def __str__(self):
        return f"{self.texto} (Nodo: {self.nodo_id})"


class Usuario(models.Model):
    nombre = models.CharField(max_length=150, default="Sin Nombre")
    sexo = models.CharField(max_length=10, default="hombre") 
    edad = models.IntegerField()
    dni = models.IntegerField(unique=True)
    id_usuario = models.IntegerField(unique=True)
    dinero = models.FloatField()  # Crédito/saldo

    def __str__(self):
        return self.nombre


class EnvioMensaje(models.Model):
    METODOS_ENVIO_CHOICES = [
        ('mqtt', 'MQTT (Descentralizado)'),
        ('efectivo', 'Efectivo'),
        ('websocket', 'WebSocket Seguro'),
        ('webrtc', 'WebRTC P2P'),
        ('pago_internet', 'Pago vía Internet'),
        ('transferencia', 'Transferencia bancaria'),
    ]

    id_envio = models.IntegerField(unique=True)
    fecha = models.DateField()
    cant_cuotas = models.IntegerField()
    cantidad = models.IntegerField(default=1) 
    metodo_envio = models.CharField(max_length=30, choices=METODOS_ENVIO_CHOICES, default='mqtt')
    mensaje = models.ForeignKey(Mensaje, on_delete=models.PROTECT)
    moderador = models.ForeignKey(Moderador, on_delete=models.PROTECT)
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT)

    def __str__(self):
        # Corregido: String en una sola línea con salto explícito \n
        return f"Envío {self.id_envio}\n{self.fecha}"