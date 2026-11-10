# Manual técnico de Onaks System

> English version: [`docs/en/technical-manual/`](../../en/technical-manual/README.md). Las dos versiones se mantienen al día juntas: cuando algo cambia, se actualizan ambas.

Este manual es para quien va a programar sobre el sistema. Explica qué es, cómo está armado, cómo se
levanta en desarrollo y en producción, cómo se prueba y cómo funciona cada parte por dentro. Al
terminarlo tendrías que poder agregar una pantalla, un circuito o una tabla siguiendo las mismas reglas
que el resto del código.

Onaks System es un sistema de pedidos B2B para una distribuidora de la zona sur del GBA (el primer
cliente vende alimentos y productos para mascotas). Los clientes son empresas que compran desde un
catálogo web; la distribuidora prepara, reparte, cobra y repone stock desde un panel de administración;
los repartidores cargan las entregas desde el celular.

## Capítulos

1. [Arquitectura y convenciones](01-arquitectura.md): stack, estructura del repositorio, cómo viaja un
   request, autenticación, permisos, auditoría, idiomas, UI y las reglas de código.
2. [Entorno de desarrollo](02-desarrollo.md): requisitos, variables de entorno, base de datos local,
   datos de demo y comandos del día a día.
3. [Producción, versiones y CI/CD](03-produccion.md): imágenes Docker, compose de producción, HTTPS,
   backups, actualizaciones, release-please y los workflows de GitHub.
4. [Base de datos](04-base-de-datos.md): modelo, convenciones, migraciones, restricciones, libros de
   solo inserción, transacciones y orden de bloqueos.
5. [Funcionamiento por módulos](05-modulos.md): catálogo y precios, carrito y pedidos, estados, stock,
   cuenta corriente y crédito, picking, reparto, compras, reportes, usuarios y seguridad.
6. [Testing](06-testing.md): tests unitarios, de punta a punta y qué corre el CI.
7. [Cómo programar sobre el sistema](07-guia-de-desarrollo.md): recetas paso a paso (pantalla nueva,
   migración, Server Action, form, permiso, texto) y la lista de control de un PR.

## Otros documentos

- [`docs/instalacion.md`](../instalacion.md): guía operativa de instalación en un servidor (para quien
  instala, no para quien programa). El capítulo 3 la resume y explica lo que hay detrás.
- [`app/e2e/README.md`](../../../app/e2e/README.md): cómo correr y escribir los tests de punta a punta (en inglés: [`README.en.md`](../../../app/e2e/README.en.md)).
- [`ROADMAP.md`](../../../ROADMAP.md): fases del proyecto, qué está hecho y las definiciones de cada una.
- [`CLAUDE.md`](../../../CLAUDE.md): resumen denso del contexto del proyecto (lo usan los asistentes de
  código; también sirve como referencia rápida de nombres de archivos y funciones).

## Glosario rápido

| Término              | Qué es                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------- |
| Cliente / empresa    | `customers`: la empresa que compra (CUIT, razón social). Tiene personas y direcciones. |
| Persona              | `persons`: alguien del cliente (o un interno). Puede tener usuario para entrar.        |
| Pedido               | `sales`: lo que confirma un cliente (o carga el admin por él), con su número `#N`.     |
| Zona                 | La localidad (`cities`) de la dirección de entrega.                                    |
| Picking              | Lista para sacar la mercadería del depósito antes de despachar.                        |
| Hoja de ruta         | `route_sheets`: el recorrido de un repartidor con sus paradas (`route_stops`).         |
| OC / IR              | Orden de compra al proveedor / informe de recepción de lo que llegó.                   |
| OP / NC              | Orden de pago al proveedor / nota de crédito del proveedor.                            |
| Libro (ledger)       | Tabla de solo inserción que registra movimientos (stock, auditoría).                   |
| Retenido por crédito | Pedido confirmado que espera que el admin lo apruebe (supera el límite o hay deuda).   |
