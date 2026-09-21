#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genere un CSV pret a importer dans Supabase (table etablissements) a partir
de l'extraction FINESS (etalab-cs1100507-stock).
"""
import csv
import json
import re
import unicodedata
import sys

SRC = "etalab-cs1100507-stock-20260512-0339.csv"
OUT_CSV = "finess_etablissements_import.csv"

# ---------------------------------------------------------------
# Departement -> region (decoupage 2016 + DOM)
# ---------------------------------------------------------------
DEPT_REGION = {}
def add(region, depts):
    for d in depts:
        DEPT_REGION[d] = region

add("Auvergne-Rhône-Alpes", ["01","03","07","15","26","38","42","43","63","69","73","74"])
add("Bourgogne-Franche-Comté", ["21","25","39","58","70","71","89","90"])
add("Bretagne", ["22","29","35","56"])
add("Centre-Val de Loire", ["18","28","36","37","41","45"])
add("Corse", ["2A","2B"])
add("Grand Est", ["08","10","51","52","54","55","57","67","68","88"])
add("Hauts-de-France", ["02","59","60","62","80"])
add("Île-de-France", ["75","77","78","91","92","93","94","95"])
add("Normandie", ["14","27","50","61","76"])
add("Nouvelle-Aquitaine", ["16","17","19","23","24","33","40","47","64","79","86","87"])
add("Occitanie", ["09","11","12","30","31","32","34","46","48","65","66","81","82"])
add("Pays de la Loire", ["44","49","53","72","85"])
add("Provence-Alpes-Côte d'Azur", ["04","05","06","13","83","84"])
add("Guadeloupe", ["971"])
add("Martinique", ["972"])
add("Guyane", ["973"])
add("La Réunion", ["974"])
add("Saint-Pierre-et-Miquelon", ["975"])
add("Mayotte", ["976"])

# ---------------------------------------------------------------
# Libelle etablissement (FINESS, champ fin) -> type de l'appli
# ---------------------------------------------------------------
LABEL_TYPE = {
    "Centre Hospitalier (C.H.)": "Hôpital public",
    "Centre Hospitalier Régional (C.H.R.)": "Hôpital public",
    "Centre hospitalier, ex Hôpital local": "Hôpital public",
    "Groupement de coopération sanitaire - Etablissement de santé": "Hôpital public",
    "Centre de Lutte Contre Cancer": "Hôpital public",
    "Centre de Consultations Cancer": "Hôpital public",
    "Dispositif Spécifique Régional du Cancer": "Hôpital public",

    "Centre Hospitalier Spécialisé lutte Maladies Mentales": "Psychiatrie",
    "Centre Médico-Psychologique (C.M.P.)": "Psychiatrie",
    "Centre d'Accueil Thérapeutique à temps partiel (C.A.T.T.P.)": "Psychiatrie",
    "Maison de Santé pour Maladies Mentales": "Psychiatrie",
    "Centre Médico-Psycho-Pédagogique (C.M.P.P.)": "Psychiatrie",
    "Appartement Thérapeutique": "Psychiatrie",

    "Etablissement de santé privé autorisé en SSR": "SSR / rééducation",
    "Etablissement Thermal": None,  # exclu (pas un lieu de soins courants)

    "Etablissement d'hébergement pour personnes âgées dépendantes": "EHPAD",
    "EHPA ne percevant pas des crédits d'assurance maladie": "EHPAD",
    "Centre de Jour pour Personnes Agées": "EHPAD",

    "Centre de Santé": "Centre de santé",
    "Maison de santé (L.6223-3)": "Centre de santé",
    "Centre de santé sexuelle": "Centre de santé",

    "Service de Soins Infirmiers A Domicile (S.S.I.A.D)": "Domicile / SSIAD",
    "Hospitalisation à Domicile": "Domicile / SSIAD",
    "Service autonomie aide et soins (SAAS)": "Domicile / SSIAD",

    "Structure d'Alternative à la dialyse en centre": "Autre",
    "Centre de dialyse": "Autre",
    "Maison de naissance": "Autre",
    "Etablissement de Soins Chirurgicaux": None,       # statut-dependant, gere a part
    "Etablissement de Soins Pluridisciplinaire": None, # statut-dependant
    "Etablissement de Soins Médicaux": None,           # statut-dependant
    "Etablissement Soins Obstétriques Chirurgico-Gynécologiques": None,  # statut-dependant
    "Etablissement de Soins Longue Durée": None,       # statut-dependant
    "Autre Etablissement Loi Hospitalière": None,      # statut-dependant
}

# Libelles dont le type depend du statut juridique (public/prive)
STATUT_DEPENDANT = {
    "Etablissement de Soins Chirurgicaux",
    "Etablissement de Soins Pluridisciplinaire",
    "Etablissement de Soins Médicaux",
    "Etablissement Soins Obstétriques Chirurgico-Gynécologiques",
    "Etablissement de Soins Longue Durée",
    "Autre Etablissement Loi Hospitalière",
}

def normalize(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Z0-9]", "", s.upper())

def smart_title(s):
    s = s.strip()
    if not s:
        return s
    small = {"de","du","des","la","le","les","et","en","sur","au","aux","d","l","a","saint","sainte"}
    words = s.lower().split(" ")
    out = []
    for i, w in enumerate(words):
        if not w:
            out.append(w)
            continue
        # gere les tirets et apostrophes
        parts = re.split(r"(-|')", w)
        parts2 = []
        for p in parts:
            if p in ("-", "'"):
                parts2.append(p)
            elif p.lower() in small and i != 0:
                parts2.append(p.lower())
            else:
                parts2.append(p[:1].upper() + p[1:] if p else p)
        out.append("".join(parts2))
    return " ".join(out)

def ville_from_ligne(ligne):
    ligne = ligne.strip()
    m = re.match(r"^\s*\d{5}\s+(.*)$", ligne)
    if m:
        v = m.group(1).strip()
    else:
        v = ligne
    v = re.sub(r"\s*CEDEX.*$", "", v, flags=re.IGNORECASE).strip()
    return smart_title(v) if v else v

# ---------------------------------------------------------------
# Deja presents en base (deduplication grossiere par ville + nom)
# ---------------------------------------------------------------
EXISTING = []
try:
    with open("../existing_etabs.json", encoding="utf-8") as f:
        EXISTING = json.load(f)
except FileNotFoundError:
    pass

EXISTING_NORM = [(normalize(n), normalize(v)) for n, v in EXISTING]

def is_duplicate(nom, ville):
    n, v = normalize(nom), normalize(ville)
    for en, ev in EXISTING_NORM:
        if v and ev and v == ev:
            # meme ville : on regarde si l'un contient l'autre (mots significatifs)
            if len(en) > 5 and (en in n or n in en):
                return True
            # sinon, tokens communs distinctifs (mots > 4 lettres)
    return False

# ---------------------------------------------------------------
# Lecture + filtrage
# ---------------------------------------------------------------
rows_out = []
seen_finess = set()
skipped_dup = 0
skipped_type = 0

with open(SRC, encoding="utf-8", errors="replace") as f:
    reader = csv.reader(f, delimiter=";")
    for row in reader:
        if not row or row[0] != "structureet":
            continue
        if len(row) < 28:
            continue
        finess_et = row[1].strip()
        nom_court = row[3].strip()
        nom_long = row[4].strip()
        dept_code = row[13].strip()
        ligne = row[15].strip()
        label_etab = row[19].strip()
        libelle_statut = row[27].strip() if len(row) > 27 else ""
        libelle_statut2 = row[25].strip() if len(row) > 25 else ""

        if label_etab not in LABEL_TYPE:
            continue

        etype = LABEL_TYPE[label_etab]
        if label_etab in STATUT_DEPENDANT:
            s25 = libelle_statut2.lower()  # ex: "ARS Établissements Publics de santé dotation globale"
            s27 = libelle_statut.lower()   # ex: "Etablissement public de santé"
            if "publics" in s25 or "etablissement public" in s27 or "établissement public" in s27:
                etype = "Hôpital public"
            else:
                etype = "Clinique privée"

        if etype is None:
            skipped_type += 1
            continue

        if finess_et in seen_finess:
            continue
        seen_finess.add(finess_et)

        nom = smart_title(nom_long if len(nom_long) >= len(nom_court) else nom_court)
        if not nom:
            continue
        ville = ville_from_ligne(ligne)
        region = DEPT_REGION.get(dept_code, DEPT_REGION.get(dept_code.lstrip("0"), ""))

        if is_duplicate(nom, ville):
            skipped_dup += 1
            continue

        rows_out.append({
            "id": f"fin-{finess_et}",
            "nom": nom,
            "ville": ville,
            "region": region,
            "type": etype,
            "adresse": "",
            "createdAt": "2026-09-18T00:00:00.000Z",
            "nbServices": 0,
        })

with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["id","nom","ville","region","type","adresse","createdAt","nbServices"])
    w.writeheader()
    for r in rows_out:
        w.writerow(r)

print(f"{len(rows_out)} etablissements ecrits dans {OUT_CSV}")
print(f"{skipped_dup} doublons ignores, {skipped_type} lignes hors-perimetre ignorees")

# repartition par type (controle)
from collections import Counter
c = Counter(r["type"] for r in rows_out)
for t, n in c.most_common():
    print(f"  {t}: {n}")
