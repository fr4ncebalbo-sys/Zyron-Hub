/* Estado sincronizado automáticamente por Colyseus con todos los clientes.
   Solo lo público de cada jugador; lo privado (EXP, dinero, inventario...) va en un mensaje 'me' solo para él. */
'use strict';
const { Schema, MapSchema, defineTypes } = require('@colyseus/schema');

class Look extends Schema {}
defineTypes(Look, { skin: 'string', hair: 'string', hairColor: 'string', cloth: 'string', acc: 'string', build: 'string', hat: 'string', scar: 'string' });

class PlayerState extends Schema {
  constructor() {
    super();
    this.look = new Look();
    this.cid = 0; this.name = ''; this.faction = 'pirate'; this.lvl = 1; this.hp = 1; this.maxHp = 1;
    this.x = 0; this.y = 0; this.boat = ''; this.dir = 1; this.moving = false; this.dead = false;
    this.bounty = 0; this.rank = 0; this.crewId = 0; this.crewName = ''; this.captain = false; this.fighting = false;
    this.ride = '';   // sid del compañero en cuyo barco va de pasajero ('' = navega solo)
    this.shipLook = '';   // navío legendario personalizado: "casco|velas|fondoBandera|emblema|símbolo"
    this.training = false;   // manteniendo T: medita/entrena (los demás ven la animación)
    this.armor = 0;          // Aura de Armadura activo: 0 = no, 1-4 = nivel (cuánto cuerpo cubre)
    this.obs = false;        // Aura de Observación activo
    this.stun = 0;           // aturdido (Aura del Rey) hasta esta hora (ms, reloj del servidor)
    this.zoan = '';          // transformado (Bestia): tipo de forma ('wolf', 'phoenix'...)
    this.prop = '';          // entrenamiento especial a la vista: 'shell' (caparazón de tortuga), 'weights', 'sword'...
    this.inside = '';        // dentro de un edificio (id del interior): solo le ven los que están en el mismo
    this.gear = '';          // espadas y accesorios a la vista (js/gear.js → publicCode)
  }
}
defineTypes(PlayerState, {
  cid: 'number', name: 'string', faction: 'string', lvl: 'uint8', hp: 'number', maxHp: 'number',
  x: 'number', y: 'number', boat: 'string', dir: 'int8', moving: 'boolean', dead: 'boolean',
  bounty: 'number', rank: 'uint8', crewId: 'number', crewName: 'string', captain: 'boolean', fighting: 'boolean', ride: 'string', shipLook: 'string',
  training: 'boolean', armor: 'uint8', obs: 'boolean', stun: 'number', zoan: 'string', prop: 'string', inside: 'string', gear: 'string',
  look: Look
});

class WorldState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.time = 0;
    this.event = '';
  }
}
defineTypes(WorldState, { players: { map: PlayerState }, time: 'number', event: 'string' });

module.exports = { Look, PlayerState, WorldState };
