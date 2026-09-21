-- Suppression des 10 temoignages de demonstration (donnees de test creees
-- pendant le developpement, avant l'ouverture publique de l'appli) et remise
-- a zero des statistiques des 4 services concernes.

delete from "temoignages" where id in
  ('tm-1','tm-2','tm-3','tm-4','tm-5','tm-6','tm-7','tm-8','tm-9','tm-10');

update "services"
set
  "nbTemoignages" = 0,
  "avgCharge" = null,
  "avgAmbiance" = null,
  "avgDirection" = null,
  "avgRemuneration" = null,
  "avgGlobal" = null,
  "avgNbPatients" = null,
  "avgNbAs" = null,
  "flagMaltraitance" = 0,
  "flagHarcelement" = 0,
  "flagRacisme" = 0,
  "aiSummary" = null,
  "aiSummaryAt" = null,
  "aiSummaryBasedOn" = 0
where id in ('svc-alzheimer-tilleuls','svc-chirurgie-parc','svc-reanimation-herriot','svc-urgences-herriot');
