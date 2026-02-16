# Elicitation Library 💄

50 techniques d'élicitation organisées en 10 catégories. Scarlet sélectionne 2-4 techniques par session selon ce qui bloque.

## Core (5)
1. **5 Whys** -- Demander "pourquoi ?" 5 fois pour atteindre la root cause d'un besoin flou
2. **First Principles** -- Décomposer le problème en éléments fondamentaux, reconstruire depuis zéro
3. **Socratic Questioning** -- Questions guidées pour amener l'utilisateur à clarifier sa propre pensée
4. **Inversion** -- "Que devrait-on faire pour que ce projet ÉCHOUE ?" Inverser pour trouver les vrais besoins
5. **Critique & Refine** -- Présenter une première ébauche volontairement imparfaite, laisser l'utilisateur corriger

## Collaboration (6)
6. **Stakeholder Round Table** -- Simuler les perspectives de différents stakeholders (dev, PM, user, ops)
7. **Expert Panel** -- Simuler 3 experts du domaine avec des opinions divergentes
8. **User Persona Focus Group** -- Créer 3 personas utilisateurs et tester les features depuis leur perspective
9. **Cross-Functional War Room** -- Perspectives simultanées : backend, frontend, infra, sécurité, UX
10. **Mentor-Apprentice** -- Expliquer le projet comme à un junior : les trous dans l'explication révèlent les trous dans les specs
11. **Improv Yes-And** -- Construire itérativement sur chaque idée de l'utilisateur ("Oui, et en plus...")

## Adversarial (5)
12. **Red Team / Blue Team** -- Attaquer les specs (trouver les failles) puis défendre (renforcer)
13. **Shark Tank Pitch** -- L'utilisateur doit "pitcher" son projet en 30 secondes : force la clarté
14. **Devil's Advocate** -- Argumenter systématiquement contre chaque feature pour tester sa solidité
15. **Pre-mortem** -- "Le projet a échoué dans 6 mois. Pourquoi ?" Identifier les risques cachés
16. **Good Cop / Bad Cop** -- Alterner entre validation enthousiaste et critique impitoyable

## Creative (6)
17. **SCAMPER** -- Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse
18. **Reverse Engineering** -- Décrire le produit fini idéal, puis remonter aux specs nécessaires
19. **What-If Scenarios** -- Explorer les cas limites : "Et si 10x plus d'utilisateurs ?", "Et si pas d'internet ?"
20. **Random Input Stimulus** -- Introduire un élément aléatoire du domaine pour débloquer la réflexion
21. **Genre Mashup** -- "Et si c'était un jeu ? Une app de dating ? Un outil médical ?" Changer le contexte pour voir autrement
22. **Time Travel** -- "Comment ce projet serait conçu en 2030 ? En 2015 ?" Perspectives temporelles

## User-Centric (5)
23. **Day-in-Life** -- Dérouler une journée type de l'utilisateur final, identifier les touchpoints
24. **Persona Deep Dive** -- Profil détaillé de l'utilisateur principal : frustrations, objectifs, comportements
25. **Customer Support Theater** -- Simuler des tickets de support : quels problèmes les users vont rencontrer ?
26. **Jobs-to-be-Done** -- "Quel JOB l'utilisateur 'engage' ce produit à faire ?" Focus sur le résultat, pas la feature
27. **Empathy Mapping** -- Ce que l'utilisateur pense, ressent, dit, fait par rapport au problème

## Prioritization (4)
28. **MoSCoW** -- Must-have, Should-have, Could-have, Won't-have pour chaque feature
29. **Boundary Analysis** -- Définir précisément ce qui est IN scope et OUT scope
30. **Extreme Scaling** -- "Et si on devait livrer en 1 jour ? En 1 an ?" Révéler les priorités vraies
31. **Negative Requirements** -- Lister explicitement ce que le système NE DOIT PAS faire

## Risk (5)
32. **Failure Mode Analysis** -- Pour chaque composant, comment peut-il échouer ? Quel impact ?
33. **Chaos Monkey Scenarios** -- "Et si la DB tombe ? Et si l'API externe est down ? Et si le disque est plein ?"
34. **Threat Modeling** -- Identifier les vecteurs d'attaque : injection, escalade de privilèges, data leak
35. **Challenge from Critical Perspective** -- Se mettre dans la peau d'un CTO sceptique
36. **Competitor Analysis** -- "Comment font les concurrents ? Qu'est-ce qu'on fait mieux/différemment ?"

## Technical (5)
37. **ADR Debate** -- Simuler un débat entre 2 architectes pour chaque choix technique majeur
38. **Rubber Duck Debugging** -- Expliquer l'architecture à voix haute, trouver les incohérences
39. **Algorithm Olympics** -- Comparer 3 approches techniques avec pros/cons chiffrés
40. **Security Audit Personas** -- Penser comme un hacker, un auditeur, un CISO
41. **Performance Profiler Panel** -- Identifier les bottlenecks potentiels avant d'écrire une ligne de code

## Advanced Reasoning (5)
42. **Tree of Thoughts** -- Explorer plusieurs chemins de raisonnement en parallèle, évaluer chaque branche
43. **Graph of Thoughts** -- Connecter les idées en réseau, identifier les dépendances et synergies
44. **Thread of Thought** -- Dérouler un raisonnement linéaire étape par étape, vérifier chaque transition
45. **Self-Consistency Validation** -- Résoudre le même problème 3 fois différemment, vérifier la convergence
46. **Meta-Prompting** -- "Quelle question devrais-je te poser pour mieux comprendre ton besoin ?"

## Retrospective (4)
47. **Hindsight Reflection** -- "Sur les projets passés similaires, qu'est-ce qui a surpris ?"
48. **Lessons Learned Extraction** -- Chercher en mémoire les patterns des projets précédents
49. **Analogy Bridge** -- "Ce projet ressemble à X, qu'est-ce qu'on peut en apprendre ?"
50. **Contradiction Resolution** -- Identifier les exigences contradictoires et forcer un choix

---

## Usage
Scarlet sélectionne 2-4 techniques par session selon le blocage rencontré. Elle nomme la technique dans ses questions.
Exemples :
- "Je vais utiliser **Pre-mortem** : ton projet a échoué dans 6 mois. Pourquoi ?"
- "Appliquons **MoSCoW** : classe tes features en Must/Should/Could/Won't."
- "Technique **5 Whys** : pourquoi as-tu besoin de cette feature ? [x5]"
