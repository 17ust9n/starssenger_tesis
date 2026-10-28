from django.contrib import admin
from .models import (Plataforma, Nodo, Administrador, Moderador, Canal, Mensaje, Usuario, EnvioMensaje)

@admin.register(Mensaje)
class MensajeAdmin(admin.ModelAdmin):
    list_display = ('id_mensaje', 'nodo_id', 'texto', 'remitente', 'categoria', 'peso', 'stock', 'costo')
    list_filter = ('categoria', 'nodo_id')
    search_fields = ('texto', 'remitente', 'categoria')


@admin.register(EnvioMensaje)
class EnvioMensajeAdmin(admin.ModelAdmin):
    list_display = ('id_envio', 'fecha', 'mensaje', 'usuario', 'moderador', 'metodo_envio', 'cant_cuotas')
    list_filter = ('fecha', 'metodo_envio', 'cant_cuotas')
    search_fields = ('usuario__nombre', 'usuario__dni', 'moderador__nombre', 'moderador__dni')


@admin.register(Nodo)
class NodoAdmin(admin.ModelAdmin):
    list_display = ('id_nodo', 'nombre', 'localidad', 'plataforma')
    search_fields = ('nombre', 'localidad')


@admin.register(Usuario)
class UsuarioAdmin(admin.ModelAdmin):
    list_display = ('id_usuario', 'nombre', 'dni', 'edad', 'dinero')
    search_fields = ('nombre', 'dni')


@admin.register(Moderador)
class ModeradorAdmin(admin.ModelAdmin):
    list_display = ('id_moderador', 'nombre', 'dni', 'nodo', 'sueldo')
    search_fields = ('nombre', 'dni')


# Registro simple para el resto de los modelos
admin.site.register(Plataforma)
admin.site.register(Administrador)
admin.site.register(Canal)