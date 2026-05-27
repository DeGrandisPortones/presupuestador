import dotenv from "dotenv";
dotenv.config();

import { dbQuery, getPool } from "../src/db.js";
import { ensureUsersAdminColumns } from "../src/usersDb.js";

const DISTRIBUTORS = [
  {
    "row": 2,
    "name": "ABERTURAS ALUMIX S.A. NOOO",
    "username": "ABERTURAS ALUMIX S.A. NOOO",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 3,
    "name": "ABERTURAS BARENGO SRL",
    "username": "barengo@gmail.com",
    "source_username": "barengo@gmail.com",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 4,
    "name": "ABERTURAS ALUMIX",
    "username": "ABERTURAS ALUMIX",
    "source_username": null,
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 5,
    "name": "ABERTURAS GUILLERMO MARTIN SAS",
    "username": "aberturasmartinsrl@gmail.com",
    "source_username": "aberturasmartinsrl@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Agustin",
    "password": "123456"
  },
  {
    "row": 6,
    "name": "ABERTURAS PH",
    "username": "mayco_67@hotmail.com",
    "source_username": "mayco_67@hotmail.com",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 7,
    "name": "ABert",
    "username": "aberturasalfa@hotmail.com",
    "source_username": "aberturasalfa@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Agustin",
    "password": "123456"
  },
  {
    "row": 8,
    "name": "ALUMINIOS BARRIOS",
    "username": "aluminiosbarrios@hotmail.com",
    "source_username": "aluminiosbarrios@hotmail.com",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 9,
    "name": "ALUSUR",
    "username": "ALUSUR",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 10,
    "name": "AR & ASOCIADOS SRL",
    "username": "ventas@araberturas.net",
    "source_username": "ventas@araberturas.net",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 11,
    "name": "BERTONE ALUMINIO",
    "username": "BERTONE ALUMINIO",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 12,
    "name": "CASA DEL BEL",
    "username": "CASA DEL BEL",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 13,
    "name": "CERBAL",
    "username": "cerbalprone@hotmail.com",
    "source_username": "cerbalprone@hotmail.com",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 14,
    "name": "ABERTURAS ALFA",
    "username": "aberturasalfa@hotmail.com__aberturas_alfa",
    "source_username": "aberturasalfa@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 15,
    "name": "DE GRANDIS PABLO",
    "username": "DE GRANDIS PABLO",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 16,
    "name": "ECOALUM",
    "username": "ventas@ecoalum.com",
    "source_username": "ventas@ecoalum.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 17,
    "name": "ESPACIO CONCRETTO SAS",
    "username": "compras@concretto.com.ar",
    "source_username": "compras@concretto.com.ar",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Agustin",
    "password": "123456"
  },
  {
    "row": 18,
    "name": "FRANCO ABERTURAS",
    "username": "ventasfrancoaberturas@hotmail.com",
    "source_username": "ventasfrancoaberturas@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 19,
    "name": "GRIVEL ABERTURAS",
    "username": "grivelaberturas@riotel.com.ar",
    "source_username": "grivelaberturas@riotel.com.ar",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Agustin",
    "password": "123456"
  },
  {
    "row": 20,
    "name": "GRUPO SHUTO",
    "username": "shutopvl@gmail.com",
    "source_username": "shutopvl@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 21,
    "name": "INDALMAD SA",
    "username": "ventas@indalmadsa.com.ar",
    "source_username": "ventas@indalmadsa.com.ar",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 22,
    "name": "INTERALUMINA SA",
    "username": "compras@interalumina.com.ar",
    "source_username": "compras@interalumina.com.ar",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Agustin",
    "password": "123456"
  },
  {
    "row": 23,
    "name": "La Banderola",
    "username": "labanderola@gmail.com",
    "source_username": "labanderola@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Daniel Pinto",
    "password": "123456"
  },
  {
    "row": 24,
    "name": "MODI ABERTURAS",
    "username": "modividrios_aluminio@hotmail.com",
    "source_username": "modividrios_aluminio@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 25,
    "name": "PEÑA ABERTURAS S.A.",
    "username": "administracion@peniaaberturas.com.a",
    "source_username": "administracion@peniaaberturas.com.a",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Daniel Pinto",
    "password": "123456"
  },
  {
    "row": 26,
    "name": "PERETTI ERNESTO",
    "username": "ernestoperettizing@gmail.com",
    "source_username": "ernestoperettizing@gmail.com",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 27,
    "name": "QCero",
    "username": "info@qcero.com.ar",
    "source_username": "info@qcero.com.ar",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 28,
    "name": "RDG ABERTURAS",
    "username": "rdgaberturas@gmail.com",
    "source_username": "rdgaberturas@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 29,
    "name": "RINDER ABERTURAS",
    "username": "administracion@rinderaberturas.com.",
    "source_username": "administracion@rinderaberturas.com.",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Daniel Pinto",
    "password": "123456"
  },
  {
    "row": 30,
    "name": "SAMPA ABERTURAS",
    "username": "sampaaberturas@hotmail.com",
    "source_username": "sampaaberturas@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 31,
    "name": "Urbantek SA",
    "username": "Urbantek SA",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 32,
    "name": "ZUPPA HERMANOS",
    "username": "zuppahermanos@gmail.com",
    "source_username": "zuppahermanos@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Agustin",
    "password": "123456"
  },
  {
    "row": 33,
    "name": "Ballaben Claudia Rosana",
    "username": "germanely@gmail.com",
    "source_username": "germanely@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 34,
    "name": "EXPO LEGNO SRL",
    "username": "EXPO LEGNO SRL",
    "source_username": null,
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 35,
    "name": "LH ABERTURAS",
    "username": "LH ABERTURAS",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 36,
    "name": "CONSTRUVIAL",
    "username": "CONSTRUVIAL",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 37,
    "name": "TU DISEÑO",
    "username": "abertura_aluminio@outlook.com",
    "source_username": "abertura_aluminio@outlook.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 38,
    "name": "CONSTRUCTORA CAPMAN SRL",
    "username": "admconstructoracapman@gmail.com",
    "source_username": "admconstructoracapman@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 39,
    "name": "Abeturas Maipu S.R.L.",
    "username": "aberturasmaipusrl@gmail.com",
    "source_username": "aberturasmaipusrl@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 40,
    "name": "IVANA DEL ROSARIO GARINO Y NICOLAS ATILI",
    "username": "IVANA DEL ROSARIO GARINO Y NICOLAS ATILI",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 41,
    "name": "LENARDON DANILO DAVID JESUS",
    "username": "LENARDON DANILO DAVID JESUS",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 42,
    "name": "METALURGICA SOLMET",
    "username": "METALURGICA SOLMET",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 43,
    "name": "MANCINELLI HNOS SAS",
    "username": "MANCINELLI HNOS SAS",
    "source_username": null,
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 44,
    "name": "ABERTURAS PYP",
    "username": "Pablogsosa22@gmail.com",
    "source_username": "Pablogsosa22@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 45,
    "name": "Alumay srl",
    "username": "Info@jpaberturas.com.ar",
    "source_username": "Info@jpaberturas.com.ar",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 46,
    "name": "HENZE HORACIO JUAN",
    "username": "HENZE HORACIO JUAN",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 47,
    "name": "Gonzalez Ivo Catriel",
    "username": "Gonzalez Ivo Catriel",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 48,
    "name": "AFG ABERTURAS",
    "username": "afgaberturass@hotmail.com",
    "source_username": "afgaberturass@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 49,
    "name": "Mariano Javier Arias",
    "username": "Closyvale@hotmail.com",
    "source_username": "Closyvale@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 50,
    "name": "ABERTURAS BONATTI",
    "username": "ABERTURAS BONATTI",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 51,
    "name": "TUTTE SAS",
    "username": "Zettadesarrollos@hotmail.com",
    "source_username": "Zettadesarrollos@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 52,
    "name": "FERROCONS SA",
    "username": "pintoaberturas@hotmail.com",
    "source_username": "pintoaberturas@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Daniel Pinto",
    "password": "123456"
  },
  {
    "row": 53,
    "name": "AFG ABERTURAS",
    "username": "afgaberturass@hotmail.com__afg_aberturas",
    "source_username": "afgaberturass@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 54,
    "name": "ALUMARC",
    "username": "admin@aberturasalumarc.com",
    "source_username": "admin@aberturasalumarc.com",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 55,
    "name": "HD ABERTURAS",
    "username": "ventas@hdaberturas.com",
    "source_username": "ventas@hdaberturas.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 56,
    "name": "BCH INGENIERIA SRL",
    "username": "ventasalucorsrl@gmail.com",
    "source_username": "ventasalucorsrl@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 57,
    "name": "Aberturas San Francisco",
    "username": "joseluisdaga2614@gmail.com",
    "source_username": "joseluisdaga2614@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 58,
    "name": "Megatek",
    "username": "rodrigobesso@hotmail.com",
    "source_username": "rodrigobesso@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 59,
    "name": "ABERTURAS EL CEDRO",
    "username": "aberturaselcedro.merlo@gmail.com",
    "source_username": "aberturaselcedro.merlo@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 60,
    "name": "TREXUS ABERTURAS",
    "username": "TREXUS ABERTURAS",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 61,
    "name": "CERRAMIENTOS MEYER",
    "username": "info@cerramientosmeyer.com.ar",
    "source_username": "info@cerramientosmeyer.com.ar",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 62,
    "name": "YPPOLITO ABERTURAS",
    "username": "yppolito@gmail.com",
    "source_username": "yppolito@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 63,
    "name": "TREVISI MARCELO",
    "username": "aberturasmelincue@yahoo.com",
    "source_username": "aberturasmelincue@yahoo.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 64,
    "name": "ANSELMI HNOS",
    "username": "ANSELMI HNOS",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 65,
    "name": "ALUCAR",
    "username": "ALUCAR",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 66,
    "name": "RJ OPENING",
    "username": "RJ OPENING",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 67,
    "name": "Sandro Orona",
    "username": "sandroorona.obra@gmail.com",
    "source_username": "sandroorona.obra@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Agustin",
    "password": "123456"
  },
  {
    "row": 68,
    "name": "GARCIA ELECTRODOMESTICOS",
    "username": "garciaelectrodomesticos@hotmail.com",
    "source_username": "garciaelectrodomesticos@hotmail.com",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 69,
    "name": "NSA PUERTAS Y VENTANAS",
    "username": "NSA PUERTAS Y VENTANAS",
    "source_username": null,
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 70,
    "name": "AZ ABERTURAS",
    "username": "AZ ABERTURAS",
    "source_username": null,
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 71,
    "name": "Industria Cordobesa SRL",
    "username": "bercarrara@hotmail.com",
    "source_username": "bercarrara@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Daniel Pinto",
    "password": "123456"
  },
  {
    "row": 72,
    "name": "RASGER NICHEA DAVID LEON",
    "username": "inoglassr4@gmail.com",
    "source_username": "inoglassr4@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 73,
    "name": "EL ALUBION",
    "username": "EL ALUBION",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 74,
    "name": "ByB ABERTURAS",
    "username": "ByB ABERTURAS",
    "source_username": null,
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 75,
    "name": "MEGATRON",
    "username": "MEGATRON",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 76,
    "name": "Ribodino y Sacilotto",
    "username": "carpinteria-rys@hotmail.com",
    "source_username": "carpinteria-rys@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 77,
    "name": "YOCCO ABERTURAS",
    "username": "YOCCO ABERTURAS",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 78,
    "name": "L&D ABERTURAS DE ALUMINIO",
    "username": "L&D ABERTURAS DE ALUMINIO",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 79,
    "name": "EQUIPAR",
    "username": "EQUIPAR",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 80,
    "name": "CONTRERAS DIEGO IVAN",
    "username": "CONTRERAS DIEGO IVAN",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Daniel Pinto",
    "password": "123456"
  },
  {
    "row": 81,
    "name": "FONSA ABERTURAS",
    "username": "FONSA ABERTURAS",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 82,
    "name": "EL IRANI ABERTURAS",
    "username": "EL IRANI ABERTURAS",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 83,
    "name": "NSA",
    "username": "NSA",
    "source_username": null,
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 84,
    "name": "ABERTURAS GARBARINO E HIJOS",
    "username": "ABERTURAS GARBARINO E HIJOS",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 85,
    "name": "MARTINATTO Y TRIPPEL SH",
    "username": "MARTINATTO Y TRIPPEL SH",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 86,
    "name": "FEBA ABERTURAS",
    "username": "info@febaaberturas.com",
    "source_username": "info@febaaberturas.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 87,
    "name": "JEVA ABERTURAS DE ALUMINIO",
    "username": "jevaberturasdealuminio@hotmail.com",
    "source_username": "jevaberturasdealuminio@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 88,
    "name": "ECOWIN",
    "username": "icodo@ecowin.com.ar",
    "source_username": "icodo@ecowin.com.ar",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 89,
    "name": "HERRAJES CAMBAR",
    "username": "cambarherrajes@coop5.com.ar",
    "source_username": "cambarherrajes@coop5.com.ar",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 90,
    "name": "ABERTURAS GUTIERREZ",
    "username": "gutierrezaberturas@gmail.com",
    "source_username": "gutierrezaberturas@gmail.com",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 91,
    "name": "LOGAR ALUMINIO",
    "username": "logaraluminio@gmail.com",
    "source_username": "logaraluminio@gmail.com",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 92,
    "name": "ALUCOM",
    "username": "ALUCOM",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Daniel Pinto",
    "password": "123456"
  },
  {
    "row": 93,
    "name": "OSCAR TAURINO",
    "username": "OSCAR TAURINO",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 94,
    "name": "OSCAR ANDRES MOLINA",
    "username": "OSCAR ANDRES MOLINA",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 95,
    "name": "ALUVE ALUMINIOS SRL",
    "username": "aluveaberturas@gmail.com",
    "source_username": "aluveaberturas@gmail.com",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 96,
    "name": "LINEAL SA",
    "username": "LINEAL SA",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 97,
    "name": "GABRIEL CEBALLOS",
    "username": "leandromaiataty@gmail.com",
    "source_username": "leandromaiataty@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 98,
    "name": "CASANOVES FABIAN",
    "username": "fcasanovesr2@gmail.com",
    "source_username": "fcasanovesr2@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 99,
    "name": "HEREDIA&MARTOS SAS",
    "username": "herediacristian312@gmail.com",
    "source_username": "herediacristian312@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 100,
    "name": "CRISTALES MONETTI SRL",
    "username": "francomonetti73@gmail.com",
    "source_username": "francomonetti73@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 101,
    "name": "ACTIS ALUMINIO",
    "username": "ACTIS ALUMINIO",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 102,
    "name": "OMAR GALLEGOS",
    "username": "gallegos_omar67@hotmail.com",
    "source_username": "gallegos_omar67@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 103,
    "name": "ABERTURAS IMPERIO",
    "username": "aberturas.imperio@hotmail.com",
    "source_username": "aberturas.imperio@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 104,
    "name": "ABERTURAS MAIPU SRL",
    "username": "administracion@aberturasmaipu.com.a",
    "source_username": "administracion@aberturasmaipu.com.a",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 105,
    "name": "ABERTURAS PAMPEANAS S.A",
    "username": "comprasaberturaspampeanas@gmail.com",
    "source_username": "comprasaberturaspampeanas@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 106,
    "name": "ADA ABERTURAS",
    "username": "Matíaskretek@hotmail.com",
    "source_username": "Matíaskretek@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 107,
    "name": "ALUMED",
    "username": "ALUMED",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 108,
    "name": "ALUMET",
    "username": "alumet@outlook.com",
    "source_username": "alumet@outlook.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 109,
    "name": "Bio Aberturas",
    "username": "Bio Aberturas",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 110,
    "name": "Carlos More",
    "username": "Carlos More",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 111,
    "name": "CENTRO INTEGRAL DEL HERRAJE",
    "username": "herraplac@gmail.com",
    "source_username": "herraplac@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 112,
    "name": "EL HERRERO ABERTURAS",
    "username": "elherrero_aberturas@hotmail.com",
    "source_username": "elherrero_aberturas@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 113,
    "name": "ESTRUCTURALES RANQUEL",
    "username": "alejandromartinez@estranquel.com.ar",
    "source_username": "alejandromartinez@estranquel.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 114,
    "name": "EURO ALUMINIO",
    "username": "EURO ALUMINIO",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 115,
    "name": "GABO",
    "username": "gabo.aluminios@gmail.com",
    "source_username": "gabo.aluminios@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 116,
    "name": "GARCIA ALUMINIOS",
    "username": "GARCIA ALUMINIOS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 117,
    "name": "HANS ABERTURAS",
    "username": "ventas@hansaberturas.com",
    "source_username": "ventas@hansaberturas.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 118,
    "name": "INDALPRO",
    "username": "INDALPRO",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 119,
    "name": "INDOORS SRL",
    "username": "indoorsaberturas@gmail.com",
    "source_username": "indoorsaberturas@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 120,
    "name": "INDUAL",
    "username": "indualaluminios@hotmail.com.ar",
    "source_username": "indualaluminios@hotmail.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 121,
    "name": "Javier Treccioli",
    "username": "saveitrek@gmail.com",
    "source_username": "saveitrek@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 122,
    "name": "Jose Zarate",
    "username": "grattonjc@hotmail.com",
    "source_username": "grattonjc@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 123,
    "name": "JUAN CARLOS GRATON",
    "username": "grattonjc@hotmail.com__juan_carlos_graton",
    "source_username": "grattonjc@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 124,
    "name": "JUNOT HOGAR",
    "username": "junot_aberturas@hotmail.com",
    "source_username": "junot_aberturas@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 125,
    "name": "WINNER S.R.L.",
    "username": "laidealaberturas@gmail.com",
    "source_username": "laidealaberturas@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 126,
    "name": "LOPEZ ALUMINIOS",
    "username": "claudiaschiodi@gmail.com",
    "source_username": "claudiaschiodi@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 127,
    "name": "MARCOLETA LUIS",
    "username": "oestemar@gmail.com",
    "source_username": "oestemar@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 128,
    "name": "MEGA ABERTURAS",
    "username": "megaaberturas@gmail.com",
    "source_username": "megaaberturas@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 129,
    "name": "MERCALUM",
    "username": "mercalumsrl@hotmail.com",
    "source_username": "mercalumsrl@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 130,
    "name": "Miguel GutiTrrez",
    "username": "grattonjc@hotmail.com__miguel_gutitrrez",
    "source_username": "grattonjc@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 131,
    "name": "MODAL ABERTURAS",
    "username": "modalaluminios@gmail.com",
    "source_username": "modalaluminios@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 132,
    "name": "OPENDOOR S.A.S.",
    "username": "OPENDOOR S.A.S.",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 133,
    "name": "Oscar Lescano",
    "username": "nangar07@hotmail.com",
    "source_username": "nangar07@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 134,
    "name": "PABLO DONAT",
    "username": "PABLO DONAT",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Agustin",
    "password": "123456"
  },
  {
    "row": 135,
    "name": "Pablo Zan",
    "username": "Pablo Zan",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Agustin",
    "password": "123456"
  },
  {
    "row": 136,
    "name": "PLACK SYSTEM (LONDERO)",
    "username": "placsystem2018@gmail.com",
    "source_username": "placsystem2018@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Agustin",
    "password": "123456"
  },
  {
    "row": 137,
    "name": "Qs Open - Qs OPEN SRL",
    "username": "info@qsopen.com.ar",
    "source_username": "info@qsopen.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 138,
    "name": "ROSSAROLI EMMANUEL",
    "username": "grattonjc@hotmail.com__rossaroli_emmanuel",
    "source_username": "grattonjc@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 139,
    "name": "SALVATORI ALUMINIOS",
    "username": "mariano_ale_sv@hotmail.com",
    "source_username": "mariano_ale_sv@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 140,
    "name": "SELEC ABERTURAS",
    "username": "selec.aberturas@gmail.com",
    "source_username": "selec.aberturas@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 141,
    "name": "WINDOOR",
    "username": "ezequielmarinograsso@gmail.com",
    "source_username": "ezequielmarinograsso@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 142,
    "name": "ZZ aberturas",
    "username": "ZZ aberturas",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 143,
    "name": "FEDERICO MAGNI",
    "username": "federico_magni@hotmail.com",
    "source_username": "federico_magni@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 144,
    "name": "VDV SA",
    "username": "ventasvdv@gmail.com",
    "source_username": "ventasvdv@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 145,
    "name": "INZPIRA SA",
    "username": "JPAEZ@INZPIRA.COM.AR",
    "source_username": "JPAEZ@INZPIRA.COM.AR",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 146,
    "name": "CASA BETO",
    "username": "casabeto@hotmail.com",
    "source_username": "casabeto@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 147,
    "name": "MM VIDRIERIA Y ABERTURAS",
    "username": "mmvidrieriaaberturas@outlook.com",
    "source_username": "mmvidrieriaaberturas@outlook.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 148,
    "name": "ORELLANO ABERTURAS",
    "username": "ORELLANO ABERTURAS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 149,
    "name": "NK ABERTURAS",
    "username": "nkaberturas@gmail.com",
    "source_username": "nkaberturas@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 150,
    "name": "FUND VISION",
    "username": "emprenderlapampa@hotmail.com",
    "source_username": "emprenderlapampa@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 151,
    "name": "MARIO JAVIER LAFFARGUE",
    "username": "locolaffargue@gmail.com",
    "source_username": "locolaffargue@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 152,
    "name": "BENEFICIAL GERMS SA",
    "username": "BENEFICIAL GERMS SA",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 153,
    "name": "COASI SRL",
    "username": "gonnicolasi@hotmail.com",
    "source_username": "gonnicolasi@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 154,
    "name": "ABERTURAS DEL OESTE",
    "username": "rosario@aberturadeloeste.com",
    "source_username": "rosario@aberturadeloeste.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 155,
    "name": "AJ ABERTURAS",
    "username": "ajaberturas@yahoo.com.ar",
    "source_username": "ajaberturas@yahoo.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 156,
    "name": "SUAREZ ALUMINIO SRL",
    "username": "SUAREZ.ALUMINIO@GMAIL.COM",
    "source_username": "SUAREZ.ALUMINIO@GMAIL.COM",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 157,
    "name": "Plasticos Bahia SS",
    "username": "Plásticosbahia@gmail.com",
    "source_username": "Plásticosbahia@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 158,
    "name": "CALUM Aluminio",
    "username": "josemartin.sastre@gmail.com",
    "source_username": "josemartin.sastre@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 159,
    "name": "METALURGICA DEL NORTE",
    "username": "ariveros80@gmail.com",
    "source_username": "ariveros80@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 160,
    "name": "Dante Omar Ferrero",
    "username": "ferralum@yahoo.com.ar",
    "source_username": "ferralum@yahoo.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 161,
    "name": "SANTOS LUIS PAULINO",
    "username": "santos57luis@gmail.com",
    "source_username": "santos57luis@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 162,
    "name": "ABERTURAS MUÑIZ SRL",
    "username": "munizsrl@hotmail.com",
    "source_username": "munizsrl@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 163,
    "name": "Oriana Gutiérrez",
    "username": "Grzgerencia@gmail.com",
    "source_username": "Grzgerencia@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 164,
    "name": "FAM ABERTURAS SRL",
    "username": "famaberturas@hotmail.com",
    "source_username": "famaberturas@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 165,
    "name": "Makxhaus SAS",
    "username": "makxhaus.aberturas@gmail.com",
    "source_username": "makxhaus.aberturas@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 166,
    "name": "Bluo Aberturas",
    "username": "carlaehaag87@gmail.com",
    "source_username": "carlaehaag87@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 167,
    "name": "ALUMIA SRL",
    "username": "alumiasrl@gmail.com",
    "source_username": "alumiasrl@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 168,
    "name": "ALBA ABERTURAS",
    "username": "ALBA ABERTURAS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Agustin",
    "password": "123456"
  },
  {
    "row": 169,
    "name": "Kayfort SRL",
    "username": "Diego79lasfille@gmail.com",
    "source_username": "Diego79lasfille@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 170,
    "name": "ENGINEERING WORKS AND SERVICE SA",
    "username": "lorenzatoaberturas@fibertel.com.ar",
    "source_username": "lorenzatoaberturas@fibertel.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 171,
    "name": "DIVANNI ALUMINIO",
    "username": "administracion@divanni.com.ar",
    "source_username": "administracion@divanni.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 172,
    "name": "LEDESMA JUAN DANIEL",
    "username": "aluled.mza@gmail.com",
    "source_username": "aluled.mza@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 173,
    "name": "Godoy Gastón",
    "username": "Gastongodoy031@.com",
    "source_username": "Gastongodoy031@.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 174,
    "name": "Tecno Access",
    "username": "Tecno Access",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 175,
    "name": "Grupo Teknal SRL",
    "username": "pfacetti@teknal.casa",
    "source_username": "pfacetti@teknal.casa",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 176,
    "name": "Doble Vidriado del Sur SAS",
    "username": "doblevidriadodelsur@hotmail.com",
    "source_username": "doblevidriadodelsur@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 177,
    "name": "Hefesto Aberturas",
    "username": "hefestoaberturas@gmail.com",
    "source_username": "hefestoaberturas@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 178,
    "name": "Nuevo Niteroi S.A.",
    "username": "aberturasaconcagua@gmail.com",
    "source_username": "aberturasaconcagua@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 179,
    "name": "TRICAN S.A",
    "username": "info@kaiseraberturas.com.ar",
    "source_username": "info@kaiseraberturas.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 180,
    "name": "Fortunato Jesús Quiroga",
    "username": "flaviogquiroga@gmail.com",
    "source_username": "flaviogquiroga@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 181,
    "name": "JULIO MATALONI",
    "username": "alumimat@hotmail.com",
    "source_username": "alumimat@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 182,
    "name": "Aberturas La Para",
    "username": "Aberturas La Para",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 183,
    "name": "Ortiz Matías Rodrigo",
    "username": "info@unitecaberturas.com.ar",
    "source_username": "info@unitecaberturas.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 184,
    "name": "Vanessa Carradore",
    "username": "vanecarradore@gmail.com",
    "source_username": "vanecarradore@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 185,
    "name": "CARRICABURU DANILO JAVIER",
    "username": "ventas@kiboaluminio.com.ar",
    "source_username": "ventas@kiboaluminio.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 186,
    "name": "Epulef Lucas Gaston",
    "username": "Epulefgaston9@gmail.com",
    "source_username": "Epulefgaston9@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 187,
    "name": "DOMO ARGENTINA SRL",
    "username": "sebastian.etchart@gmail.com",
    "source_username": "sebastian.etchart@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 188,
    "name": "N Y C SRL",
    "username": "casalaberturas22@gmail.com",
    "source_username": "casalaberturas22@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 189,
    "name": "INSAURRALDE BRUNO",
    "username": "insaurraldebrunoomar@gmail.com",
    "source_username": "insaurraldebrunoomar@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 190,
    "name": "Diaz Meiners S.R.L",
    "username": "info@diazmeiners.com",
    "source_username": "info@diazmeiners.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 191,
    "name": "Corralon Agrojuries",
    "username": "Agrojuries@hotmail.com",
    "source_username": "Agrojuries@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 192,
    "name": "Nqn portones automaticos",
    "username": "nqnportonesautomaticos@gmail.com",
    "source_username": "nqnportonesautomaticos@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 193,
    "name": "Matias Moron",
    "username": "Innovaraberturas@hotmail.com",
    "source_username": "Innovaraberturas@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 194,
    "name": "FRATELLO",
    "username": "Fratelloportonesyaberturas@gmail.co",
    "source_username": "Fratelloportonesyaberturas@gmail.co",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 195,
    "name": "Brian Aron Wiedemann",
    "username": "brianwiedemann01@gmail.com",
    "source_username": "brianwiedemann01@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 196,
    "name": "Jose Luis Medrano",
    "username": "alumedaberturas@hotmail.com",
    "source_username": "alumedaberturas@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 197,
    "name": "Crema Nestor Fernando",
    "username": "Aberturascrema@aberturascrema.com.a",
    "source_username": "Aberturascrema@aberturascrema.com.a",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 198,
    "name": "CANNELLI LEONEL RODRIGO",
    "username": "CANNELLI LEONEL RODRIGO",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 199,
    "name": "LINDON AYELEN MILAGRO MACARENA",
    "username": "LINDON AYELEN MILAGRO MACARENA",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 200,
    "name": "MARCANI LUCAS ANDRES AGUSTIN",
    "username": "megso.2020@gmail.com",
    "source_username": "megso.2020@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 201,
    "name": "Gomez Alejandro Hernán",
    "username": "proveedores@alubun.com",
    "source_username": "proveedores@alubun.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 202,
    "name": "Metales Maipu SAS",
    "username": "ventasaberturasmaipu@gmail.com",
    "source_username": "ventasaberturasmaipu@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 203,
    "name": "Maximiliano Iciksonas",
    "username": "Maximilianoiciksonas@gmail.com",
    "source_username": "Maximilianoiciksonas@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 204,
    "name": "BMA Group SAS",
    "username": "dieg.gimenez@ecowindows.com.ar",
    "source_username": "dieg.gimenez@ecowindows.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 205,
    "name": "GANDINI FABRICIO EMILIANO",
    "username": "Aberturasaluminioarm@hotmail.com",
    "source_username": "Aberturasaluminioarm@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 206,
    "name": "NES-CAM SA",
    "username": "gus.rosa1963@gmail.com",
    "source_username": "gus.rosa1963@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 207,
    "name": "Guillermo Carlos Martinez y Luciano Dami",
    "username": "habitat@cerramientosdepvc.com",
    "source_username": "habitat@cerramientosdepvc.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 208,
    "name": "ARIEL RUBEN SERAVALLE",
    "username": "ARIEL RUBEN SERAVALLE",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 209,
    "name": "MOSCONI FACUNDO",
    "username": "cmglasscristales@gmail.com",
    "source_username": "cmglasscristales@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 210,
    "name": "FAIL LUCAS GERMAN Y FAIL JUAN MARCOS",
    "username": "tallerfail@hotmail.com",
    "source_username": "tallerfail@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 211,
    "name": "FERREYRA GRACIELA ROSAURA",
    "username": "FERREYRA GRACIELA ROSAURA",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 212,
    "name": "LAG Solutions SAS",
    "username": "Solucioneslag@gmail.com",
    "source_username": "Solucioneslag@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Daniel Pinto",
    "password": "123456"
  },
  {
    "row": 213,
    "name": "MIRIAN ITATI CARBALLO",
    "username": "vidrieriaalvear@hotmail.com.ar",
    "source_username": "vidrieriaalvear@hotmail.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 214,
    "name": "BONETTO GUSTAVO",
    "username": "gustavo_bonetto@live.com",
    "source_username": "gustavo_bonetto@live.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 215,
    "name": "CANDELA OLIVERA",
    "username": "CANDELA OLIVERA",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 216,
    "name": "RICKERT JOSE ALBERTO",
    "username": "Lacasadelasaberturasparana@gmail.co",
    "source_username": "Lacasadelasaberturasparana@gmail.co",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 217,
    "name": "MELCHIOR LUCAS SEBASTIAN",
    "username": "lmelchior@wintech.com.ar",
    "source_username": "lmelchior@wintech.com.ar",
    "price_list_label": "1",
    "odoo_pricelist_id": null,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 218,
    "name": "MARCELO URBA",
    "username": "Decoexpress.logistica@hotmail.com",
    "source_username": "Decoexpress.logistica@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 219,
    "name": "MARIA SOLEDAD OCHOA",
    "username": "MARISOL8A2010@HOTMAIL.COM",
    "source_username": "MARISOL8A2010@HOTMAIL.COM",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Daniel Pinto",
    "password": "123456"
  },
  {
    "row": 220,
    "name": "SMARQ TRES ESPACIOS SA",
    "username": "smarq.info@gmail.com",
    "source_username": "smarq.info@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 221,
    "name": "ROSARIO ALUMINIO",
    "username": "Walterbittocco@hotmail.com",
    "source_username": "Walterbittocco@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 222,
    "name": "GUIDETTI JESUS DAVID",
    "username": "guidettijesus@gmail.com",
    "source_username": "guidettijesus@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 223,
    "name": "LANGE SANTIAGO GERMAN",
    "username": "ventas@nutzenpvc.com.ar",
    "source_username": "ventas@nutzenpvc.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 224,
    "name": "SUAREZ OSCAR ALBERTO",
    "username": "alejo11suarez@gmail.com",
    "source_username": "alejo11suarez@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 225,
    "name": "JM ABERTURAS CBA",
    "username": "Jmaberturascba@gmail.com",
    "source_username": "Jmaberturascba@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 226,
    "name": "JOSE MARIA FRANCHI",
    "username": "jmfranchi3@hotmail.com",
    "source_username": "jmfranchi3@hotmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 227,
    "name": "Grupo DM Ditam Bahia Blanca SRL",
    "username": "ditamaberturas@gmail.com",
    "source_username": "ditamaberturas@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 228,
    "name": "Elvio Vecchio",
    "username": "Elvio Vecchio",
    "source_username": null,
    "price_list_label": "1",
    "odoo_pricelist_id": null,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 229,
    "name": "RICCI LUCAS MARTIN",
    "username": "RICCI LUCAS MARTIN",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 230,
    "name": "LOS AMIGOS ABERTURAS Y HERRERIA",
    "username": "LOS AMIGOS ABERTURAS Y HERRERIA",
    "source_username": null,
    "price_list_label": "1",
    "odoo_pricelist_id": null,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 231,
    "name": "Herreria Matias Rojo",
    "username": "Herreria Matias Rojo",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 232,
    "name": "SIMA EQUIPAMIENTOS",
    "username": "simaequipamientos@gmail.com",
    "source_username": "simaequipamientos@gmail.com",
    "price_list_label": "1",
    "odoo_pricelist_id": null,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 233,
    "name": "POTENCIAR SUR",
    "username": "POTENCIAR SUR",
    "source_username": null,
    "price_list_label": "1",
    "odoo_pricelist_id": null,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 234,
    "name": "Antonio Nalli",
    "username": "Antonio Nalli",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 235,
    "name": "ABERTURAS RANELAGH",
    "username": "ABERTURAS RANELAGH",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 236,
    "name": "ABERTURAS CHANA SAS",
    "username": "ABERTURAS CHANA SAS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 237,
    "name": "ABERTURAS CENTRO",
    "username": "pablo.labrador@hotmail.com.ar",
    "source_username": "pablo.labrador@hotmail.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 238,
    "name": "Sandrone Ruben",
    "username": "sandrone@gmail.com",
    "source_username": "sandrone@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 239,
    "name": "MATIAS GARRO",
    "username": "MATIAS GARRO",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 240,
    "name": "Bensich Fabián",
    "username": "Santotoportones@yahoo.com.ar",
    "source_username": "Santotoportones@yahoo.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 241,
    "name": "LD VIDRIOS Y ALUMINIOS",
    "username": "arieldiaz644@gmail.com",
    "source_username": "arieldiaz644@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 242,
    "name": "Aluherrajes",
    "username": "aluherrajesfirmat@gmail.com",
    "source_username": "aluherrajesfirmat@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 243,
    "name": "PAPP ALUMINIOS",
    "username": "pappesteban@gmail.com",
    "source_username": "pappesteban@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 244,
    "name": "Opentech",
    "username": "nbarrionuevo@alopentech.com.ar",
    "source_username": "nbarrionuevo@alopentech.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 245,
    "name": "Comercial Santa Rita SRL",
    "username": "Comercial Santa Rita SRL",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 246,
    "name": "REMIGIO ULLA",
    "username": "remigioulla@yahoo.com",
    "source_username": "remigioulla@yahoo.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 247,
    "name": "J&A ALUMINIOS Y VIDRIOS",
    "username": "J&A ALUMINIOS Y VIDRIOS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 248,
    "name": "SILVANO ABERTURAS",
    "username": "localsilvano@gmail.com",
    "source_username": "localsilvano@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 249,
    "name": "LD ALUMINIOS",
    "username": "arieldiaz644@gmail.com__ld_aluminios",
    "source_username": "arieldiaz644@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 250,
    "name": "SERAFINI ABERTURAS",
    "username": "SERAFINI ABERTURAS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 251,
    "name": "ABERTURAS SARMIENTO",
    "username": "andymartinezoviedo@hotmail.com",
    "source_username": "andymartinezoviedo@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 252,
    "name": "Aberturas Marco",
    "username": "spsebastianperez@gmail.com",
    "source_username": "spsebastianperez@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 253,
    "name": "OVIEDO ABERTURAS",
    "username": "OVIEDO ABERTURAS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 254,
    "name": "EDUARDO GIANONNI",
    "username": "egianonni.74@gmail.com",
    "source_username": "egianonni.74@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 255,
    "name": "ABERTURAS SAN GABRIEL",
    "username": "ABERTURAS SAN GABRIEL",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 256,
    "name": "EL PORTICO",
    "username": "EL PORTICO",
    "source_username": null,
    "price_list_label": "1",
    "odoo_pricelist_id": null,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 257,
    "name": "LOGAR",
    "username": "LOGAR",
    "source_username": null,
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 258,
    "name": "MATIAS VOTTERO",
    "username": "MATIAS VOTTERO",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 259,
    "name": "ALUFAM",
    "username": "ALUFAM",
    "source_username": null,
    "price_list_label": "1",
    "odoo_pricelist_id": null,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 260,
    "name": "TR ABERTURAS",
    "username": "TR ABERTURAS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 261,
    "name": "DARIO CURONE",
    "username": "DARIO CURONE",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 262,
    "name": "ZAIRE MATIAS",
    "username": "ZAIRE MATIAS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 263,
    "name": "LA MORENITA",
    "username": "ventas@aberturaslamorenita.com.ar",
    "source_username": "ventas@aberturaslamorenita.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 264,
    "name": "BOLDRINI ABERTURAS",
    "username": "BOLDRINI ABERTURAS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 265,
    "name": "LEONARDO BOHELER",
    "username": "LEONARDO BOHELER",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Agustin",
    "password": "123456"
  },
  {
    "row": 266,
    "name": "LUCIANO BOSSANO",
    "username": "LUCIANO BOSSANO",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 267,
    "name": "ALUCAB",
    "username": "ALUCAB",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 268,
    "name": "QUIERO GUSTAVO ARIEL",
    "username": "aberturaslavallezarate@gmail.com",
    "source_username": "aberturaslavallezarate@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 269,
    "name": "ABERTURAS AMEGHINO",
    "username": "ABERTURAS AMEGHINO",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 270,
    "name": "ABERTURAS BUENOS AIRES",
    "username": "ABERTURAS BUENOS AIRES",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 271,
    "name": "Soluciones Metálicas Lujan",
    "username": "solucionesmetalicaslujan@gmail.com",
    "source_username": "solucionesmetalicaslujan@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 272,
    "name": "Portones DIRONI",
    "username": "portonesdironi@gmail.com",
    "source_username": "portonesdironi@gmail.com",
    "price_list_label": "3",
    "odoo_pricelist_id": 24,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 273,
    "name": "BONETTO DIEGO",
    "username": "BONETTO DIEGO",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 274,
    "name": "ABERTURAS DEL PILAR",
    "username": "adppresupuesto@hotmail.com",
    "source_username": "adppresupuesto@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 275,
    "name": "METALURGICA PB",
    "username": "ppavillamaria@gmail.com",
    "source_username": "ppavillamaria@gmail.com",
    "price_list_label": "6",
    "odoo_pricelist_id": 27,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 276,
    "name": "CRISTIAN (DISTRIBUIDOR)",
    "username": "CRISTIAN (DISTRIBUIDOR)",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 277,
    "name": "ABERTURAS SAN JERONIMO",
    "username": "Info@aberturassanjeronimo.com",
    "source_username": "Info@aberturassanjeronimo.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 278,
    "name": "ABERTURAS IBAÑEZ",
    "username": "IBANEZABERTURAS@GMAIL.COM",
    "source_username": "IBANEZABERTURAS@GMAIL.COM",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 279,
    "name": "JM ABERTURAS",
    "username": "JM ABERTURAS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 280,
    "name": "ALUCOR",
    "username": "ALUCOR",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 281,
    "name": "ABERTURAS LA CANDELARIA",
    "username": "info@aberturaslacandelaria.com.ar",
    "source_username": "info@aberturaslacandelaria.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 282,
    "name": "ABERTURAS EL FARO",
    "username": "gabriel@elfaro.com.ar",
    "source_username": "gabriel@elfaro.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 283,
    "name": "GABRIEL",
    "username": "GABRIEL",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 284,
    "name": "SAN RAFAEL",
    "username": "SAN RAFAEL",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 285,
    "name": "PRS ABERTURAS",
    "username": "PRS ABERTURAS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 286,
    "name": "TECNO FE ALUMINIO",
    "username": "tecnofealuminio@hotmail.com",
    "source_username": "tecnofealuminio@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 287,
    "name": "HIERRO PAMPA",
    "username": "hierropampa@gmail.com",
    "source_username": "hierropampa@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 288,
    "name": "HORACIO DEL VECHIO",
    "username": "HORACIO DEL VECHIO",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 289,
    "name": "BRASCA MARTIN",
    "username": "martinbrasca1@gmail.com",
    "source_username": "martinbrasca1@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 290,
    "name": "ALUVID",
    "username": "ALUVID",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 291,
    "name": "IGNACIO",
    "username": "IGNACIO",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 292,
    "name": "ALTEZZA ABERTURAS",
    "username": "ALTEZZA ABERTURAS",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 293,
    "name": "EZEQUIEL CAVERZAN",
    "username": "EZEQUIEL CAVERZAN",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 294,
    "name": "OSCAR GODOY",
    "username": "Info@aberturasgodoy.com.ar",
    "source_username": "Info@aberturasgodoy.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 295,
    "name": "HERRERIA DYM",
    "username": "diegomartin8330@gmail.com",
    "source_username": "diegomartin8330@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 296,
    "name": "JESUS EMANUEL COUSSE",
    "username": "JESUS EMANUEL COUSSE",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 297,
    "name": "Graciela Alejandra Velis",
    "username": "Puertas.chascomus@gmail.com",
    "source_username": "Puertas.chascomus@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 298,
    "name": "ORTEGA MARIO CESAR",
    "username": "ORTEGA MARIO CESAR",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 299,
    "name": "ABERTURAS EL MASTIL",
    "username": "aberturaselmastil@hotmail.com",
    "source_username": "aberturaselmastil@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 300,
    "name": "OBERTURA PVC SRL",
    "username": "compras@oberturapvc.com.ar",
    "source_username": "compras@oberturapvc.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 301,
    "name": "ABERTURAS SAN RAFAEL SAS",
    "username": "centroaberturassanrafael@gmail.com",
    "source_username": "centroaberturassanrafael@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 302,
    "name": "HERRERIA BMA",
    "username": "godoyp708@gmail.com",
    "source_username": "godoyp708@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 303,
    "name": "ABERTURAS TENAZ",
    "username": "pablo.tenaglia@live.com.ar",
    "source_username": "pablo.tenaglia@live.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 304,
    "name": "CEROALUM ABERTURAS",
    "username": "ceroalumaberturas@gmail.com",
    "source_username": "ceroalumaberturas@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Flavio Pelagagge",
    "password": "123456"
  },
  {
    "row": 305,
    "name": "ABERTURAS DORINZI",
    "username": "Danieladorinzi@hotmail.com",
    "source_username": "Danieladorinzi@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 306,
    "name": "AJ COMPACTO SA",
    "username": "AJ COMPACTO SA",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 307,
    "name": "ALWEIN ABERTURAS",
    "username": "alweinaberturas@hotmail.com",
    "source_username": "alweinaberturas@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 308,
    "name": "ARDINO VIDRIOS",
    "username": "ardinovidrios@hotmail.com",
    "source_username": "ardinovidrios@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 309,
    "name": "ABERTURAS ROMA",
    "username": "Aberturas_roma@hotmail.com",
    "source_username": "Aberturas_roma@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 310,
    "name": "ABERTURAS BARCALA",
    "username": "Barcalaaberturas@gmail.com",
    "source_username": "Barcalaaberturas@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 311,
    "name": "ABERTURAS LOS AMIGOS",
    "username": "Aberturasla@hotmail.com",
    "source_username": "Aberturasla@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Natalia Tabbia",
    "password": "123456"
  },
  {
    "row": 312,
    "name": "ABERTURAS TOMAS",
    "username": "jorgearancibia_12@hotmail.com",
    "source_username": "jorgearancibia_12@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 313,
    "name": "ABERTURAS MADALUM",
    "username": "Info@aberturasmadalum.com.ar",
    "source_username": "Info@aberturasmadalum.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ornella Petetta",
    "password": "123456"
  },
  {
    "row": 314,
    "name": "Gonzalez Mariano Germán",
    "username": "Gonzaleztem@gmail.com",
    "source_username": "Gonzaleztem@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 315,
    "name": "ABERTURAS DEL CENTRO SAS",
    "username": "admin@aberturasdelcentro.com.ar",
    "source_username": "admin@aberturasdelcentro.com.ar",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Ludmila Crotto",
    "password": "123456"
  },
  {
    "row": 316,
    "name": "MADECONST",
    "username": "MADECONST",
    "source_username": null,
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 317,
    "name": "ALUMINIOS CHACABUCO",
    "username": "aluminiochacabuco@hotmail.com",
    "source_username": "aluminiochacabuco@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 318,
    "name": "SAN JOSE ABERTURAS",
    "username": "sanjosejunin@gmail.com",
    "source_username": "sanjosejunin@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 319,
    "name": "ALUMAC",
    "username": "alumac_@hotmail.com",
    "source_username": "alumac_@hotmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 320,
    "name": "Aberturas Manchi",
    "username": "aberturasmanchi@gmail.com",
    "source_username": "aberturasmanchi@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  },
  {
    "row": 321,
    "name": "Gerardo Oscar Albeverio",
    "username": "aberturasmanchi@gmail.com__gerardo_oscar_albeverio",
    "source_username": "aberturasmanchi@gmail.com",
    "price_list_label": "2",
    "odoo_pricelist_id": 23,
    "seller_name": "Marcelo",
    "password": "123456"
  }
];

const DEFAULT_DISTRIBUTOR_PASSWORD = "123456";
const SELLER_USER_ID_BY_ALIAS = new Map([
  [normalizeText("Agustin"), 22],
  [normalizeText("Agustin DeGrandis"), 22],
  [normalizeText("Agustin De Grandis"), 22],
  [normalizeText("Marcelo"), 21],
  [normalizeText("Marcelo Koncija"), 21],
  [normalizeText("Ornella"), 17],
  [normalizeText("Ornella Petetta"), 17],
  [normalizeText("Natalia"), 18],
  [normalizeText("Natalia Tabbia"), 18],
  [normalizeText("Ludmila"), 20],
  [normalizeText("Ludmila Crotto"), 20],
  [normalizeText("Flavio"), 23],
  [normalizeText("Flavio Pelagagge"), 23],
  [normalizeText("Daniel"), 24],
  [normalizeText("Daniel Pinto"), 24],
]);

const RESET_EXISTING_DISTRIBUTOR_PASSWORDS = process.env.RESET_EXISTING_DISTRIBUTOR_PASSWORDS === "true";
const STRICT_IMPORT = process.env.STRICT_IMPORT === "true";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sellerDisplayName(user) {
  return String(user?.full_name || user?.username || "").trim();
}

function findSeller(sellers, sellerName) {
  const target = normalizeText(sellerName);
  if (!target) return { seller: null, reason: "Sin vendedor asignado en el Excel" };

  const mappedSellerId = SELLER_USER_ID_BY_ALIAS.get(target);
  if (mappedSellerId) {
    const seller = sellers.find((s) => Number(s.id) === Number(mappedSellerId));
    if (seller) return { seller, reason: "" };
    return {
      seller: null,
      reason: `El vendedor "${sellerName}" está mapeado al usuario #${mappedSellerId}, pero ese usuario no existe o no está activo como vendedor`,
    };
  }

  const exact = sellers.filter((s) =>
    normalizeText(s.full_name) === target || normalizeText(s.username) === target
  );
  if (exact.length === 1) return { seller: exact[0], reason: "" };
  if (exact.length > 1) return { seller: null, reason: `Vendedor ambiguo para "${sellerName}"` };

  const contains = sellers.filter((s) => {
    const name = normalizeText(s.full_name);
    const username = normalizeText(s.username);
    return (name && (name.includes(target) || target.includes(name))) || (username && (username.includes(target) || target.includes(username)));
  });
  if (contains.length === 1) return { seller: contains[0], reason: "" };
  if (contains.length > 1) return { seller: null, reason: `Vendedor ambiguo para "${sellerName}": ${contains.map(sellerDisplayName).join(", ")}` };

  return { seller: null, reason: `No se encontró vendedor activo para "${sellerName}"` };
}

async function getSellers() {
  const r = await dbQuery(
    `select id, username, full_name
       from public.presupuestador_users
      where coalesce(is_vendedor,false)=true
        and coalesce(is_active,true)=true
      order by username asc`
  );
  return r.rows || [];
}

async function findExistingUser(username) {
  const r = await dbQuery(
    `select id, username, visible_password from public.presupuestador_users where lower(username)=lower($1) limit 1`,
    [username]
  );
  return r.rows?.[0] || null;
}

async function upsertDistributor(item, seller) {
  const existing = await findExistingUser(item.username);
  if (existing) {
    if (RESET_EXISTING_DISTRIBUTOR_PASSWORDS) {
      const r = await dbQuery(
        `update public.presupuestador_users
            set full_name=$2,
                is_active=true,
                is_distribuidor=true,
                is_vendedor=false,
                is_medidor=false,
                is_logistica=false,
                is_superuser=false,
                odoo_pricelist_id=$3,
                assigned_seller_user_id=$4,
                visible_password=$5,
                password_hash=crypt($5, gen_salt('bf')),
                updated_at=now()
          where id=$1
          returning id, username`,
        [existing.id, item.name, item.odoo_pricelist_id, seller.id, DEFAULT_DISTRIBUTOR_PASSWORD]
      );
      return { action: "updated_with_password", user: r.rows?.[0] || null };
    }

    const r = await dbQuery(
      `update public.presupuestador_users
          set full_name=$2,
              is_active=true,
              is_distribuidor=true,
              is_vendedor=false,
              is_medidor=false,
              is_logistica=false,
              is_superuser=false,
              odoo_pricelist_id=$3,
              assigned_seller_user_id=$4,
              updated_at=now()
        where id=$1
        returning id, username`,
      [existing.id, item.name, item.odoo_pricelist_id, seller.id]
    );
    return { action: "updated", user: r.rows?.[0] || null };
  }

  const r = await dbQuery(
    `insert into public.presupuestador_users
      (username, password_hash, visible_password, full_name, is_active,
       is_distribuidor, is_vendedor, is_medidor, is_logistica, is_superuser,
       is_enc_comercial, is_rev_tecnica,
       odoo_partner_id, odoo_pricelist_id, default_maps_url, assigned_seller_user_id)
     values
      ($1, crypt($2, gen_salt('bf')), $2, $3, true,
       true, false, false, false, false,
       false, false,
       null, $4, null, $5)
     returning id, username`,
    [item.username, DEFAULT_DISTRIBUTOR_PASSWORD, item.name, item.odoo_pricelist_id, seller.id]
  );
  return { action: "created", user: r.rows?.[0] || null };
}

async function main() {
  await ensureUsersAdminColumns();
  const sellers = await getSellers();
  const created = [];
  const updated = [];
  const updatedWithPassword = [];
  const skipped = [];

  for (const item of DISTRIBUTORS) {
    if (!item.odoo_pricelist_id) {
      skipped.push({ row: item.row, name: item.name, username: item.username, reason: `Lista de precios no mapeada: ${item.price_list_label || "vacía"}` });
      continue;
    }
    const match = findSeller(sellers, item.seller_name);
    if (!match.seller) {
      skipped.push({ row: item.row, name: item.name, username: item.username, reason: match.reason });
      continue;
    }
    const result = await upsertDistributor(item, match.seller);
    const row = { row: item.row, name: item.name, username: item.username, seller: sellerDisplayName(match.seller), pricelist_id: item.odoo_pricelist_id };
    if (result.action === "created") created.push(row);
    else if (result.action === "updated_with_password") updatedWithPassword.push(row);
    else updated.push(row);
  }

  console.log(JSON.stringify({
    ok: skipped.length === 0,
    total_excel: DISTRIBUTORS.length,
    created: created.length,
    updated: updated.length,
    updated_with_password: updatedWithPassword.length,
    skipped: skipped.length,
    skipped_rows: skipped,
    available_sellers: sellers.map((s) => ({ id: s.id, username: s.username, full_name: s.full_name })),
    note: RESET_EXISTING_DISTRIBUTOR_PASSWORDS
      ? "Se resetearon contraseñas de distribuidores existentes."
      : "Los usuarios existentes no cambiaron contraseña. Para forzar reset: RESET_EXISTING_DISTRIBUTOR_PASSWORDS=true npm run import:distribuidores"
  }, null, 2));

  if (STRICT_IMPORT && skipped.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("IMPORT DISTRIBUIDORES ERROR:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await getPool().end(); } catch {}
  });
