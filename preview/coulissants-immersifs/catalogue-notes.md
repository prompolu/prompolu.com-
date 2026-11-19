# Catalogue geometry and remaining source gaps

Reviewed 19 November 2026. Preview branch only. The eleven product names, their characteristics and RAL 9005 givré finish remain selected; S88RP Prime and the separately named élevable variant are excluded.

## What is now sourced directly

The detail viewer's default sample uses `catalogue-section.js` and `source-profiles.json`. Each aluminium outline is extracted from the manufacturer's PDF vectors, including its actual chamber voids, grooves, retaining pockets and curved faces. It is extruded at the calibrated drawing scale. The old shared heuristic corner generator is no longer used in this viewer. It does not squeeze sash depths or glazing to fit an assumed rail pitch.

The connected Drive folder “strugal catalogues” supplied full fabrication/catalogue PDFs for S70P, S88R, S90P/S90R, S110P, S125RP, S140RP and an S88RP manufacturing manual. The manual alone did not supply all of the assembled sections needed for S88RP. Original private PDFs are retained outside this checkout in `/workspace/previews/catalogue-reference/`; they are not published in the preview.

| System | Aluminium contours in default detail view | Source |
| --- | --- | --- |
| S70P | Side and bottom; 70027 frame, 70091 sash | S70P catalogue, Mar. 2023, pp. 36 and 51; two-track sample |
| S70R | Side only; no invented bottom section | Official `ficha_S70R.pdf`, dimensioned 1:1 section; 45 mm frame / 57 mm overall envelope |
| S86RP | Side only; no invented bottom section | Manufacturer technical sheet, p. 2, 85 mm frame / 37.6 mm sash |
| S88R | Side and bottom; 70247, 7490, 7489, 7322 | S88R MA.23.00, pp. 55 and 91 |
| S88RP | Side only; split 74 mm frame | Official `STRUGAL S88RP.pdf`, printed pp. 56–57 |
| S90P | Curved side and bottom; 4412 frame, 70110 sash | S90R/S90P E.2018 catalogue, pp. 42 and 44 |
| S90R | Side and bottom; 4916 frame, 4917/4918 sashes, 4921 rail | S90R/S90P E.2018 catalogue, pp. 38 and 40; identified by part references (page headers are inconsistent) |
| S90RP | Catalogue image only; technical section geometry unavailable | Official 2021 commercial sheet and existing repository cutout |
| S110P | Side and bottom; distinct 4536/4933 frame and 4535 sash, 4960 bead, 4537 rail | S110P catalogue, Mar. 2023, pp. 48 and 51 |
| S125RP | Side and bottom; R6960/R6961, 7029 and 4805 | S125RP catalogue, Mar. 2023, pp. 52 and 61; 32 mm glazing example |
| S140RP Infinity | Side and bottom; 9121/9124, 7466 | S140RP Infinity E.25.08, pp. 62 and 70; perimeter frame example |

The original PDFs' Bezier curves are flattened with a 0.01 PDF-point flatness target. Coordinates are stored in millimetres with 0.001 mm rounding. Sub-0.0001 mm² seams from PDF stroke tessellation are excluded as print artefacts. This is precision relative to a printed drawing, not manufacturer CAD dimensional certification. Actual manufactured radii and tolerances require CAD.

## What is still provisional

These are source-based aluminium section studies, **not exact replicas of complete assembled windows**. The specimen lengths, corner joints, glass and IGU spacer are schematic. EPDM seals, pile seals, polyamide inserts, trolleys, bearings, screws, handles, locking hardware and drainage variants are not fully reconstructed. Some different components touch in the printed silhouette; a PDF cannot establish all independent 3D boundaries.

The full scroll-through windows and the “Ensemble”, “Nœud central” and “Seuil” modes still use the earlier illustrative geometry. The viewer states this explicitly. The seven corner samples do not validate those full animated assemblies. The three partial samples are labelled “Profil latéral”. S90RP no longer presents a guessed corner model as catalogue geometry.

To complete an exact reconstruction, obtain the manufacturer's DXF/DWG cross-sections and STEP/3D hardware/assembly files for the eleven systems, especially the missing S90RP sections and the side/head/sill/meeting details for S70R, S86RP and S88RP. Use catalogue-version-specific part references when selecting variants; never treat Prime/elevable drawings as replacements for S88RP.

## Verification

The geometry tests cast rays through every source chamber probe and solid-face probe. They verify that all 75 retained chamber voids remain open in the 3D extrusion and that sawn aluminium faces are present. They also check finite geometry, the seven-complete/three-partial/one-missing source distinction, excluded variants, and clear first-person camera passages. These checks establish geometry integrity and source coverage, not full product equivalence.
