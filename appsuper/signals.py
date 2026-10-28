from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction
from .models import EnvioMensaje

# Decorador @receiver: registra la función como un OBSERVER (Sujeto: EnvioMensaje)
@receiver(post_save, sender=EnvioMensaje)
def ejecutar_observadores_de_envio(sender, instance, created, **kwargs):
    """
    Despachador del Observer. 
    Se ejecuta automáticamente CADA VEZ que se crea un EnvioMensaje.
    """
    if created:
        # Se ejecuta de forma segura una vez confirmada la transacción en la BD
        transaction.on_commit(lambda: actualizar_stock_y_saldo_usuario(instance))


def actualizar_stock_y_saldo_usuario(envio):
    """Ejecuta las acciones de los observadores tras confirmar el envío."""
    # 🔌 IMPORTACIÓN LOCAL (Opcional): Si usas una función helper para calcular costos dinámicos
    # from .views import calcular_costo_composite_manual 

    mensaje = envio.mensaje
    usuario = envio.usuario

    # 👁️ Observador 1: Actualizar stock / intentos de entrega del mensaje
    mensaje.stock -= envio.cantidad
    mensaje.save(update_fields=['stock'])

    # 👁️ Observador 2: Descontar saldo o dinero del usuario
    # Si calculas costo dinámico puedes usar tu helper; de lo contrario usas mensaje.costo
    costo_total = mensaje.costo * envio.cantidad

    usuario.dinero -= costo_total
    usuario.save(update_fields=['dinero'])