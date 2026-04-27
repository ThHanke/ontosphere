# Pizza Tutorial — OWL-RL Demo

> Rebuilds the Manchester Pizza Tutorial ontology using only MCP tool calls, then runs OWL-RL
> reasoning to infer types from domain/range axioms, propagate types via subClassOf chains,
> and fire inverse property rules.
> Seed file — edit this, then regenerate with: `node scripts/run-demo.mjs docs/mcp-demo/seeds/pizza-tutorial.md`

---

**You:** Let's build the Manchester Pizza Ontology step by step. Start with the TBox —
first the three top-level disjoint classes: Pizza, PizzaBase, and PizzaTopping.

**Assistant:** Starting in TBox view. Pizza, PizzaBase, and PizzaTopping are siblings under
owl:Thing and must be declared pairwise disjoint — no individual can be both a Pizza and a
PizzaTopping, for example.

`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"setViewMode","arguments":{"mode":"tbox"}}}`
`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#Pizza","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"Pizza"}}}`
`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"PizzaBase"}}}`
`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"PizzaTopping"}}}`

Pairwise disjointness between the three root classes:

`{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase"}}}`
`{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`

```tool-result
<!-- runner fills this in -->
```

---

**You:** Now add the pizza base subclasses and the NamedPizza subclass hierarchy.

**Assistant:** Two base types and the named pizza branch. NamedPizza is the class of pizzas
found on a menu; the specific named pizzas are its subclasses.

Base subclasses:

`{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#ThinAndCrispyBase","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"ThinAndCrispyBase"}}}`
`{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#DeepPanBase","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"DeepPanBase"}}}`
`{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#ThinAndCrispyBase","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase"}}}`
`{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#DeepPanBase","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase"}}}`
`{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#ThinAndCrispyBase","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#DeepPanBase"}}}`

Named pizza branch:

`{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#NamedPizza","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"NamedPizza"}}}`
`{"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#Margherita","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"Margherita"}}}`
`{"jsonrpc":"2.0","id":15,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#AmericanHot","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"AmericanHot"}}}`
`{"jsonrpc":"2.0","id":16,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#FruttiDiMare","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"FruttiDiMare"}}}`
`{"jsonrpc":"2.0","id":17,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#NamedPizza","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza"}}}`
`{"jsonrpc":"2.0","id":18,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#Margherita","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#NamedPizza"}}}`
`{"jsonrpc":"2.0","id":19,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#AmericanHot","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#NamedPizza"}}}`
`{"jsonrpc":"2.0","id":20,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#FruttiDiMare","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#NamedPizza"}}}`

```tool-result
<!-- runner fills this in -->
```

---

**You:** Now the topping hierarchy — four disjoint categories under PizzaTopping, each with
specific leaf toppings.

**Assistant:** Four topping categories, all pairwise disjoint (no topping can be both a
CheeseTopping and a MeatTopping), then the leaf toppings:

Topping category nodes:

`{"jsonrpc":"2.0","id":21,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"CheeseTopping"}}}`
`{"jsonrpc":"2.0","id":22,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#MeatTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"MeatTopping"}}}`
`{"jsonrpc":"2.0","id":23,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"VegetableTopping"}}}`
`{"jsonrpc":"2.0","id":24,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#FishTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"FishTopping"}}}`

SubClassOf from each category to PizzaTopping:

`{"jsonrpc":"2.0","id":25,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":26,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#MeatTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":27,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":28,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#FishTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`

Pairwise disjointness — six pairs:

`{"jsonrpc":"2.0","id":29,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#MeatTopping"}}}`
`{"jsonrpc":"2.0","id":30,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping"}}}`
`{"jsonrpc":"2.0","id":31,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#FishTopping"}}}`
`{"jsonrpc":"2.0","id":32,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#MeatTopping","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping"}}}`
`{"jsonrpc":"2.0","id":33,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#MeatTopping","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#FishTopping"}}}`
`{"jsonrpc":"2.0","id":34,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#FishTopping"}}}`

Leaf topping nodes:

`{"jsonrpc":"2.0","id":35,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#MozzarellaTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"MozzarellaTopping"}}}`
`{"jsonrpc":"2.0","id":36,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#TomatoTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"TomatoTopping"}}}`
`{"jsonrpc":"2.0","id":37,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#OliveTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"OliveTopping"}}}`
`{"jsonrpc":"2.0","id":38,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#PeperoniSausageTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"PeperoniSausageTopping"}}}`
`{"jsonrpc":"2.0","id":39,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#AnchoviesTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"AnchoviesTopping"}}}`
`{"jsonrpc":"2.0","id":40,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#GarlicTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"GarlicTopping"}}}`

Leaf topping subClassOf links:

`{"jsonrpc":"2.0","id":41,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#MozzarellaTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping"}}}`
`{"jsonrpc":"2.0","id":42,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#TomatoTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping"}}}`
`{"jsonrpc":"2.0","id":43,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#OliveTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping"}}}`
`{"jsonrpc":"2.0","id":44,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#PeperoniSausageTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#MeatTopping"}}}`
`{"jsonrpc":"2.0","id":45,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#AnchoviesTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#FishTopping"}}}`
`{"jsonrpc":"2.0","id":46,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#GarlicTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping"}}}`

```tool-result
<!-- runner fills this in -->
```

---

**You:** Now add the object properties — hasTopping, hasBase, and their inverses.

**Assistant:** Four property nodes, then domain/range axioms and inverseOf declarations.
I'll also mark hasBase as owl:FunctionalProperty — a pizza has exactly one base.

`{"jsonrpc":"2.0","id":47,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","typeIri":"http://www.w3.org/2002/07/owl#ObjectProperty","label":"hasTopping"}}}`
`{"jsonrpc":"2.0","id":48,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#hasBase","typeIri":"http://www.w3.org/2002/07/owl#ObjectProperty","label":"hasBase"}}}`
`{"jsonrpc":"2.0","id":49,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#isToppingOf","typeIri":"http://www.w3.org/2002/07/owl#ObjectProperty","label":"isToppingOf"}}}`
`{"jsonrpc":"2.0","id":50,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#isBaseOf","typeIri":"http://www.w3.org/2002/07/owl#ObjectProperty","label":"isBaseOf"}}}`

Domain and range:

`{"jsonrpc":"2.0","id":51,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#domain","objectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza"}}}`
`{"jsonrpc":"2.0","id":52,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#range","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":53,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#hasBase","predicateIri":"http://www.w3.org/2000/01/rdf-schema#domain","objectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza"}}}`
`{"jsonrpc":"2.0","id":54,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#hasBase","predicateIri":"http://www.w3.org/2000/01/rdf-schema#range","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase"}}}`
`{"jsonrpc":"2.0","id":55,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#isToppingOf","predicateIri":"http://www.w3.org/2000/01/rdf-schema#domain","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":56,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#isToppingOf","predicateIri":"http://www.w3.org/2000/01/rdf-schema#range","objectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza"}}}`
`{"jsonrpc":"2.0","id":57,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#isBaseOf","predicateIri":"http://www.w3.org/2000/01/rdf-schema#domain","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase"}}}`
`{"jsonrpc":"2.0","id":58,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#isBaseOf","predicateIri":"http://www.w3.org/2000/01/rdf-schema#range","objectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza"}}}`

InverseOf declarations:

`{"jsonrpc":"2.0","id":59,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#isToppingOf","predicateIri":"http://www.w3.org/2002/07/owl#inverseOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping"}}}`
`{"jsonrpc":"2.0","id":60,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#isBaseOf","predicateIri":"http://www.w3.org/2002/07/owl#inverseOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#hasBase"}}}`

FunctionalProperty for hasBase:

`{"jsonrpc":"2.0","id":61,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#hasBase","predicateIri":"http://www.w3.org/1999/02/22-rdf-syntax-ns#type","objectIri":"http://www.w3.org/2002/07/owl#FunctionalProperty"}}}`

`{"jsonrpc":"2.0","id":62,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":160}}}`
`{"jsonrpc":"2.0","id":63,"method":"tools/call","params":{"name":"expandAll","arguments":{}}}`
`{"jsonrpc":"2.0","id":64,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":160}}}`

```tool-result
<!-- runner fills this in -->
```

```snapshot
caption: TBox complete — class hierarchy, disjointness, and property axioms
slug: tbox
```

---

**You:** Now the ABox. Add three pizza individuals — one Margherita-style, one AmericanHot-style,
one FruttiDiMare. Give none of them an explicit type; I want the reasoner to figure that out from
the domain of hasTopping alone.

**Assistant:** Switching to ABox view. Three untyped pizza individuals, then the topping and base
individuals typed only at their most specific leaf class — the reasoner will climb from there.

`{"jsonrpc":"2.0","id":65,"method":"tools/call","params":{"name":"setViewMode","arguments":{"mode":"abox"}}}`

Three untyped pizza individuals:

`{"jsonrpc":"2.0","id":66,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#pizza1","label":"pizza1"}}}`
`{"jsonrpc":"2.0","id":67,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#pizza2","label":"pizza2"}}}`
`{"jsonrpc":"2.0","id":68,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#pizza3","label":"pizza3"}}}`

Topping individuals for pizza1 (Margherita-style: mozzarella, tomato, garlic):

`{"jsonrpc":"2.0","id":69,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#mozz1","typeIri":"http://www.pizza-ontology.com/pizza.owl#MozzarellaTopping","label":"mozz"}}}`
`{"jsonrpc":"2.0","id":70,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#tom1","typeIri":"http://www.pizza-ontology.com/pizza.owl#TomatoTopping","label":"tomato"}}}`
`{"jsonrpc":"2.0","id":71,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#garlic1","typeIri":"http://www.pizza-ontology.com/pizza.owl#GarlicTopping","label":"garlic"}}}`

Topping individuals for pizza2 (AmericanHot-style: peperoni, mozzarella, olive):

`{"jsonrpc":"2.0","id":72,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#pep1","typeIri":"http://www.pizza-ontology.com/pizza.owl#PeperoniSausageTopping","label":"peperoni"}}}`
`{"jsonrpc":"2.0","id":73,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#mozz2","typeIri":"http://www.pizza-ontology.com/pizza.owl#MozzarellaTopping","label":"mozz"}}}`
`{"jsonrpc":"2.0","id":74,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#olive1","typeIri":"http://www.pizza-ontology.com/pizza.owl#OliveTopping","label":"olive"}}}`

Topping individuals for pizza3 (FruttiDiMare-style: anchovies, tomato):

`{"jsonrpc":"2.0","id":75,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#anch1","typeIri":"http://www.pizza-ontology.com/pizza.owl#AnchoviesTopping","label":"anchovies"}}}`
`{"jsonrpc":"2.0","id":76,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#tom2","typeIri":"http://www.pizza-ontology.com/pizza.owl#TomatoTopping","label":"tomato"}}}`

Base individuals:

`{"jsonrpc":"2.0","id":77,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#thin1","typeIri":"http://www.pizza-ontology.com/pizza.owl#ThinAndCrispyBase","label":"thin & crispy"}}}`
`{"jsonrpc":"2.0","id":78,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#deep1","typeIri":"http://www.pizza-ontology.com/pizza.owl#DeepPanBase","label":"deep pan"}}}`
`{"jsonrpc":"2.0","id":79,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#thin2","typeIri":"http://www.pizza-ontology.com/pizza.owl#ThinAndCrispyBase","label":"thin & crispy"}}}`

```tool-result
<!-- runner fills this in -->
```

---

**You:** Connect the pizzas to their toppings and bases.

**Assistant:** Batching all ABox edges:

`{"jsonrpc":"2.0","id":80,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza1","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#mozz1"}}}`
`{"jsonrpc":"2.0","id":81,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza1","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#tom1"}}}`
`{"jsonrpc":"2.0","id":82,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza1","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#garlic1"}}}`
`{"jsonrpc":"2.0","id":83,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza1","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasBase","objectIri":"http://www.pizza-ontology.com/pizza.owl#thin1"}}}`
`{"jsonrpc":"2.0","id":84,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza2","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#pep1"}}}`
`{"jsonrpc":"2.0","id":85,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza2","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#mozz2"}}}`
`{"jsonrpc":"2.0","id":86,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza2","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#olive1"}}}`
`{"jsonrpc":"2.0","id":87,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza2","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasBase","objectIri":"http://www.pizza-ontology.com/pizza.owl#deep1"}}}`
`{"jsonrpc":"2.0","id":88,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza3","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#anch1"}}}`
`{"jsonrpc":"2.0","id":89,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza3","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#tom2"}}}`
`{"jsonrpc":"2.0","id":90,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza3","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasBase","objectIri":"http://www.pizza-ontology.com/pizza.owl#thin2"}}}`

`{"jsonrpc":"2.0","id":91,"method":"tools/call","params":{"name":"expandAll","arguments":{}}}`
`{"jsonrpc":"2.0","id":92,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"dagre-lr","spacing":200}}}`

```tool-result
<!-- runner fills this in -->
```

```snapshot
caption: ABox — three untyped pizzas with toppings and bases before reasoning
slug: abox-before-reasoning
```

---

**You:** Run the reasoner. What can OWL-RL infer?

**Assistant:** Running OWL-RL reasoning. Expected inferences:

- **pizza1, pizza2, pizza3** → type `Pizza` (rdfs2: hasTopping/hasBase domain is Pizza)
- **thin1, thin2** → type `PizzaBase` (rdfs3: hasBase range is PizzaBase; then ThinAndCrispyBase ⊆ PizzaBase via rdfs9)
- **deep1** → type `PizzaBase`
- **mozz1, mozz2** → `CheeseTopping` → `PizzaTopping` (rdfs9, climbing MozzarellaTopping ⊆ CheeseTopping ⊆ PizzaTopping)
- **tom1, tom2**, **garlic1**, **olive1** → `VegetableTopping` → `PizzaTopping`
- **pep1** → `MeatTopping` → `PizzaTopping`
- **anch1** → `FishTopping` → `PizzaTopping`
- **isToppingOf inverseOf hasTopping** fires: all toppings get isToppingOf back to their pizza
- **isBaseOf inverseOf hasBase** fires: all bases get isBaseOf back to their pizza

The disjointness axioms guard consistency: had any topping been typed as both CheeseTopping and MeatTopping simultaneously, the reasoner would detect the contradiction.

`{"jsonrpc":"2.0","id":93,"method":"tools/call","params":{"name":"runReasoning","arguments":{}}}`
`{"jsonrpc":"2.0","id":94,"method":"tools/call","params":{"name":"expandAll","arguments":{}}}`
`{"jsonrpc":"2.0","id":95,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"dagre-lr","spacing":200}}}`

```tool-result
<!-- runner fills this in -->
```

```snapshot
caption: After reasoning — all pizza types inferred, topping superclass chains climbed, inverse edges added
slug: after-reasoning
```

---

**You:** Focus on pizza1 — show me its inferred type and its topping mozzarella. Does the
mozzarella know it's a CheeseTopping and PizzaTopping?

**Assistant:** Panning to pizza1 first, then to mozz1:

`{"jsonrpc":"2.0","id":96,"method":"tools/call","params":{"name":"focusNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#pizza1"}}}`
`{"jsonrpc":"2.0","id":97,"method":"tools/call","params":{"name":"expandNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#pizza1","expand":true}}}`

```tool-result
<!-- runner fills this in -->
```

```snapshot
caption: pizza1 — type Pizza inferred from hasTopping domain; all three toppings known via isToppingOf
slug: pizza1-focus
```

---

**You:** And show the mozzarella individual — the full inferred superclass chain.

**Assistant:** Focusing on mozz1 to show MozzarellaTopping → CheeseTopping → PizzaTopping:

`{"jsonrpc":"2.0","id":98,"method":"tools/call","params":{"name":"focusNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#mozz1"}}}`
`{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"expandNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#mozz1","expand":true}}}`

```tool-result
<!-- runner fills this in -->
```

```snapshot
caption: mozz1 — MozzarellaTopping ⊆ CheeseTopping ⊆ PizzaTopping inferred via subClassOf chain
slug: mozz1-focus
```
