# Pizza Tutorial — OWL-RL Demo

> Rebuilds the Manchester Pizza Tutorial ontology using only MCP tool calls, then runs OWL-RL
> reasoning to infer types from domain/range axioms, propagate types via subClassOf chains,
> and fire inverse property rules.
> Seed file — do not edit the rendered file; edit this and regenerate.

---

**You:** Let's build the Manchester Pizza Ontology. Start in TBox view and add the three
top-level classes: Pizza, PizzaBase, and PizzaTopping.

**Assistant:** In OWL, a class is a named set of individuals. We start with three broad
categories — every individual in this ontology will belong to at least one of them.
Switching to TBox view (the ontology schema) and placing the root classes.


<details>
<summary>5 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"setViewMode","arguments":{"mode":"tbox"}}}`
`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#Pizza","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"Pizza"}}}`
`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"PizzaBase"}}}`
`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":200}}}`

```tool-result
[VisGraph — 5 tools ✓]
✓ setViewMode
✓ addNode: http://www.pizza-ontology.com/pizza.owl#Pizza
✓ addNode: http://www.pizza-ontology.com/pizza.owl#PizzaBase
✓ addNode: http://www.pizza-ontology.com/pizza.owl#PizzaTopping
✓ runLayout: elk-layered

Canvas: 3 nodes, 0 links
```

</details>

![Three root classes — every individual in this ontology is a Pizza, a PizzaBase, or a PizzaTopping](./pizza-tutorial/01-root-classes-bare.svg)

---

**You:** These three classes are siblings — no individual can belong to more than one.
Declare them pairwise disjoint.

**Assistant:** owl:disjointWith is a hard constraint: if two classes are disjoint and the
reasoner finds an individual typed as both, it signals an inconsistency. We need three
pairs to cover every combination.


<details>
<summary>4 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase"}}}`
`{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":200}}}`

```tool-result
[VisGraph — 4 tools ✓]
✓ addLink: s=Pizza p=disjointWith o=PizzaBase
✓ addLink: s=Pizza p=disjointWith o=PizzaTopping
✓ addLink: s=PizzaBase p=disjointWith o=PizzaTopping
✓ runLayout: elk-layered

Canvas: 3 nodes, 3 links
```

</details>

![owl:disjointWith — an individual cannot be both a Pizza and a PizzaBase (or PizzaTopping). The reasoner enforces this.](./pizza-tutorial/02-root-disjoint.svg)

---

**You:** Add the two pizza base subclasses and declare them disjoint from each other.

**Assistant:** rdfs:subClassOf means every ThinAndCrispyBase individual is automatically
also a PizzaBase — the subclass inherits everything the superclass says. The two bases are
also disjoint: no base can be both thin and deep pan.


<details>
<summary>6 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#ThinAndCrispyBase","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"ThinAndCrispyBase"}}}`
`{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#DeepPanBase","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"DeepPanBase"}}}`
`{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#ThinAndCrispyBase","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase"}}}`
`{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#DeepPanBase","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase"}}}`
`{"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#ThinAndCrispyBase","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#DeepPanBase"}}}`
`{"jsonrpc":"2.0","id":15,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":160}}}`

```tool-result
[VisGraph — 6 tools ✓]
✓ addNode: http://www.pizza-ontology.com/pizza.owl#ThinAndCrispyBase
✓ addNode: http://www.pizza-ontology.com/pizza.owl#DeepPanBase
✓ addLink: s=ThinAndCrispyBase p=subClassOf o=PizzaBase
✓ addLink: s=DeepPanBase p=subClassOf o=PizzaBase
✓ addLink: s=ThinAndCrispyBase p=disjointWith o=DeepPanBase
✓ runLayout: elk-layered

Canvas: 5 nodes, 6 links
```

</details>

![rdfs:subClassOf — ThinAndCrispyBase and DeepPanBase are both PizzaBases, but disjoint from each other](./pizza-tutorial/03-base-hierarchy.svg)

---

**You:** Now add the NamedPizza branch with three specific pizzas under it.

**Assistant:** NamedPizza represents pizzas you'd find on a menu — it is itself a subclass of
Pizza. Margherita, AmericanHot, and FruttiDiMare are subclasses of NamedPizza, so they
are also implicitly Pizzas through the chain.


<details>
<summary>9 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":16,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#NamedPizza","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"NamedPizza"}}}`
`{"jsonrpc":"2.0","id":17,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#Margherita","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"Margherita"}}}`
`{"jsonrpc":"2.0","id":18,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#AmericanHot","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"AmericanHot"}}}`
`{"jsonrpc":"2.0","id":19,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#FruttiDiMare","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"FruttiDiMare"}}}`
`{"jsonrpc":"2.0","id":20,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#NamedPizza","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza"}}}`
`{"jsonrpc":"2.0","id":21,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#Margherita","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#NamedPizza"}}}`
`{"jsonrpc":"2.0","id":22,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#AmericanHot","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#NamedPizza"}}}`
`{"jsonrpc":"2.0","id":23,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#FruttiDiMare","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#NamedPizza"}}}`
`{"jsonrpc":"2.0","id":24,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":160}}}`

```tool-result
[VisGraph — 9 tools ✓]
✓ addNode: http://www.pizza-ontology.com/pizza.owl#NamedPizza
✓ addNode: http://www.pizza-ontology.com/pizza.owl#Margherita
✓ addNode: http://www.pizza-ontology.com/pizza.owl#AmericanHot
✓ addNode: http://www.pizza-ontology.com/pizza.owl#FruttiDiMare
✓ addLink: s=NamedPizza p=subClassOf o=Pizza
✓ addLink: s=Margherita p=subClassOf o=NamedPizza
✓ addLink: s=AmericanHot p=subClassOf o=NamedPizza
✓ addLink: s=FruttiDiMare p=subClassOf o=NamedPizza
✓ runLayout: elk-layered

Canvas: 9 nodes, 10 links
```

</details>

![NamedPizza ⊆ Pizza — the subclass hierarchy means Margherita is a NamedPizza and also a Pizza](./pizza-tutorial/04-named-pizza-hierarchy.svg)

---

**You:** Add the four topping categories under PizzaTopping.

**Assistant:** The tutorial groups toppings into four categories. Each is a subclass of
PizzaTopping — so every MozzarellaTopping (which we'll add next) will also be a
PizzaTopping through the chain.


<details>
<summary>9 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":25,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"CheeseTopping"}}}`
`{"jsonrpc":"2.0","id":26,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#MeatTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"MeatTopping"}}}`
`{"jsonrpc":"2.0","id":27,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"VegetableTopping"}}}`
`{"jsonrpc":"2.0","id":28,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#FishTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"FishTopping"}}}`
`{"jsonrpc":"2.0","id":29,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":30,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#MeatTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":31,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":32,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#FishTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":33,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":160}}}`

```tool-result
[VisGraph — 9 tools ✓]
✓ addNode: http://www.pizza-ontology.com/pizza.owl#CheeseTopping
✓ addNode: http://www.pizza-ontology.com/pizza.owl#MeatTopping
✓ addNode: http://www.pizza-ontology.com/pizza.owl#VegetableTopping
✓ addNode: http://www.pizza-ontology.com/pizza.owl#FishTopping
✓ addLink: s=CheeseTopping p=subClassOf o=PizzaTopping
✓ addLink: s=MeatTopping p=subClassOf o=PizzaTopping
✓ addLink: s=VegetableTopping p=subClassOf o=PizzaTopping
✓ addLink: s=FishTopping p=subClassOf o=PizzaTopping
✓ runLayout: elk-layered

Canvas: 13 nodes, 14 links
```

</details>

![Four topping categories — each a subclass of PizzaTopping, so every specific topping inherits PizzaTopping membership](./pizza-tutorial/05-topping-categories.svg)

---

**You:** The four topping categories are mutually exclusive. Declare all six pairwise disjointness axioms.

**Assistant:** An ingredient cannot be both a cheese and a meat topping at the same time —
this is a real-world constraint we encode explicitly. With four categories there are six
unique pairs. If the reasoner later finds an individual typed as two disjoint categories,
it will flag an inconsistency.


<details>
<summary>7 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":34,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#MeatTopping"}}}`
`{"jsonrpc":"2.0","id":35,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping"}}}`
`{"jsonrpc":"2.0","id":36,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#FishTopping"}}}`
`{"jsonrpc":"2.0","id":37,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#MeatTopping","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping"}}}`
`{"jsonrpc":"2.0","id":38,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#MeatTopping","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#FishTopping"}}}`
`{"jsonrpc":"2.0","id":39,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping","predicateIri":"http://www.w3.org/2002/07/owl#disjointWith","objectIri":"http://www.pizza-ontology.com/pizza.owl#FishTopping"}}}`
`{"jsonrpc":"2.0","id":40,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":160}}}`

```tool-result
[VisGraph — 7 tools ✓]
✓ addLink: s=CheeseTopping p=disjointWith o=MeatTopping
✓ addLink: s=CheeseTopping p=disjointWith o=VegetableTopping
✓ addLink: s=CheeseTopping p=disjointWith o=FishTopping
✓ addLink: s=MeatTopping p=disjointWith o=VegetableTopping
✓ addLink: s=MeatTopping p=disjointWith o=FishTopping
✓ addLink: s=VegetableTopping p=disjointWith o=FishTopping
✓ runLayout: elk-layered

Canvas: 13 nodes, 20 links
```

</details>

![Six disjointWith axioms guard consistency — Cheese, Meat, Vegetable, Fish cannot overlap](./pizza-tutorial/06-topping-disjoint.svg)

---

**You:** Add the specific leaf toppings under each category.

**Assistant:** Leaf classes are the most specific types in the hierarchy. The reasoner will
later use the subClassOf chain to automatically lift an individual typed as MozzarellaTopping
all the way up to CheeseTopping and then PizzaTopping — no extra assertions needed.


<details>
<summary>17 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":41,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#MozzarellaTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"MozzarellaTopping"}}}`
`{"jsonrpc":"2.0","id":42,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#ParmesanTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"ParmesanTopping"}}}`
`{"jsonrpc":"2.0","id":43,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#PeperoniSausageTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"PeperoniSausageTopping"}}}`
`{"jsonrpc":"2.0","id":44,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#TomatoTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"TomatoTopping"}}}`
`{"jsonrpc":"2.0","id":45,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#OliveTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"OliveTopping"}}}`
`{"jsonrpc":"2.0","id":46,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#GarlicTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"GarlicTopping"}}}`
`{"jsonrpc":"2.0","id":47,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#AnchoviesTopping","typeIri":"http://www.w3.org/2002/07/owl#Class","label":"AnchoviesTopping"}}}`
`{"jsonrpc":"2.0","id":48,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#MozzarellaTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping"}}}`
`{"jsonrpc":"2.0","id":49,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#ParmesanTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#CheeseTopping"}}}`
`{"jsonrpc":"2.0","id":50,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#PeperoniSausageTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#MeatTopping"}}}`
`{"jsonrpc":"2.0","id":51,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#TomatoTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping"}}}`
`{"jsonrpc":"2.0","id":52,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#OliveTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping"}}}`
`{"jsonrpc":"2.0","id":53,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#GarlicTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#VegetableTopping"}}}`
`{"jsonrpc":"2.0","id":54,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#AnchoviesTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#subClassOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#FishTopping"}}}`
`{"jsonrpc":"2.0","id":55,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":140}}}`
`{"jsonrpc":"2.0","id":56,"method":"tools/call","params":{"name":"expandAll","arguments":{}}}`
`{"jsonrpc":"2.0","id":57,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":140}}}`

```tool-result
[VisGraph — 17 tools ✓]
✓ addNode: http://www.pizza-ontology.com/pizza.owl#MozzarellaTopping
✓ addNode: http://www.pizza-ontology.com/pizza.owl#ParmesanTopping
✓ addNode: http://www.pizza-ontology.com/pizza.owl#PeperoniSausageTopping
✓ addNode: http://www.pizza-ontology.com/pizza.owl#TomatoTopping
✓ addNode: http://www.pizza-ontology.com/pizza.owl#OliveTopping
✓ addNode: http://www.pizza-ontology.com/pizza.owl#GarlicTopping
✓ addNode: http://www.pizza-ontology.com/pizza.owl#AnchoviesTopping
✓ addLink: s=MozzarellaTopping p=subClassOf o=CheeseTopping
✓ addLink: s=ParmesanTopping p=subClassOf o=CheeseTopping
✓ addLink: s=PeperoniSausageTopping p=subClassOf o=MeatTopping
✓ addLink: s=TomatoTopping p=subClassOf o=VegetableTopping
✓ addLink: s=OliveTopping p=subClassOf o=VegetableTopping
✓ addLink: s=GarlicTopping p=subClassOf o=VegetableTopping
✓ addLink: s=AnchoviesTopping p=subClassOf o=FishTopping
✓ runLayout: elk-layered
✓ expandAll
✓ runLayout: elk-layered

Canvas: 20 nodes, 27 links
```

</details>

![Leaf toppings — the most specific types. Reasoner will climb the chain: MozzarellaTopping → CheeseTopping → PizzaTopping](./pizza-tutorial/07-tbox-leaf-toppings.svg)

---

**You:** Add the two object properties — hasTopping and hasBase — with their domain and range.

**Assistant:** Properties are relations between individuals. The domain says what the subject
must be; the range says what the object must be. This is what powers type inference: if
an individual X uses hasTopping, the reasoner deduces X is a Pizza even without an
explicit type assertion.


<details>
<summary>7 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":58,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","typeIri":"http://www.w3.org/2002/07/owl#ObjectProperty","label":"hasTopping"}}}`
`{"jsonrpc":"2.0","id":59,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#hasBase","typeIri":"http://www.w3.org/2002/07/owl#ObjectProperty","label":"hasBase"}}}`
`{"jsonrpc":"2.0","id":60,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#domain","objectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza"}}}`
`{"jsonrpc":"2.0","id":61,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","predicateIri":"http://www.w3.org/2000/01/rdf-schema#range","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":62,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#hasBase","predicateIri":"http://www.w3.org/2000/01/rdf-schema#domain","objectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza"}}}`
`{"jsonrpc":"2.0","id":63,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#hasBase","predicateIri":"http://www.w3.org/2000/01/rdf-schema#range","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase"}}}`
`{"jsonrpc":"2.0","id":64,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":140}}}`

```tool-result
[VisGraph — 7 tools ✓]
✓ addNode: http://www.pizza-ontology.com/pizza.owl#hasTopping
✓ addNode: http://www.pizza-ontology.com/pizza.owl#hasBase
✓ addLink: s=hasTopping p=domain o=Pizza
✓ addLink: s=hasTopping p=range o=PizzaTopping
✓ addLink: s=hasBase p=domain o=Pizza
✓ addLink: s=hasBase p=range o=PizzaBase
✓ runLayout: elk-layered

Canvas: 22 nodes, 31 links
```

</details>

![hasTopping domain Pizza, range PizzaTopping — using this property is enough for the reasoner to infer the type](./pizza-tutorial/08-properties-domain-range.svg)

---

**You:** Add isToppingOf and isBaseOf as inverse properties, and mark hasBase as functional.

**Assistant:** owl:inverseOf means if pizza1 hasTopping mozz1 is asserted, the reasoner
automatically adds mozz1 isToppingOf pizza1 without any extra triples from us.
owl:FunctionalProperty on hasBase says each pizza has at most one base — a useful constraint
on the real world.


<details>
<summary>12 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":65,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#isToppingOf","typeIri":"http://www.w3.org/2002/07/owl#ObjectProperty","label":"isToppingOf"}}}`
`{"jsonrpc":"2.0","id":66,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#isBaseOf","typeIri":"http://www.w3.org/2002/07/owl#ObjectProperty","label":"isBaseOf"}}}`
`{"jsonrpc":"2.0","id":67,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#isToppingOf","predicateIri":"http://www.w3.org/2002/07/owl#inverseOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping"}}}`
`{"jsonrpc":"2.0","id":68,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#isBaseOf","predicateIri":"http://www.w3.org/2002/07/owl#inverseOf","objectIri":"http://www.pizza-ontology.com/pizza.owl#hasBase"}}}`
`{"jsonrpc":"2.0","id":69,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#isToppingOf","predicateIri":"http://www.w3.org/2000/01/rdf-schema#domain","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaTopping"}}}`
`{"jsonrpc":"2.0","id":70,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#isToppingOf","predicateIri":"http://www.w3.org/2000/01/rdf-schema#range","objectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza"}}}`
`{"jsonrpc":"2.0","id":71,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#isBaseOf","predicateIri":"http://www.w3.org/2000/01/rdf-schema#domain","objectIri":"http://www.pizza-ontology.com/pizza.owl#PizzaBase"}}}`
`{"jsonrpc":"2.0","id":72,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#isBaseOf","predicateIri":"http://www.w3.org/2000/01/rdf-schema#range","objectIri":"http://www.pizza-ontology.com/pizza.owl#Pizza"}}}`
`{"jsonrpc":"2.0","id":73,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#hasBase","predicateIri":"http://www.w3.org/1999/02/22-rdf-syntax-ns#type","objectIri":"http://www.w3.org/2002/07/owl#FunctionalProperty"}}}`
`{"jsonrpc":"2.0","id":74,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":140}}}`
`{"jsonrpc":"2.0","id":75,"method":"tools/call","params":{"name":"expandAll","arguments":{}}}`
`{"jsonrpc":"2.0","id":76,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"elk-layered","spacing":140}}}`

```tool-result
[VisGraph — 12 tools ✓]
✓ addNode: http://www.pizza-ontology.com/pizza.owl#isToppingOf
✓ addNode: http://www.pizza-ontology.com/pizza.owl#isBaseOf
✓ addLink: s=isToppingOf p=inverseOf o=hasTopping
✓ addLink: s=isBaseOf p=inverseOf o=hasBase
✓ addLink: s=isToppingOf p=domain o=PizzaTopping
✓ addLink: s=isToppingOf p=range o=Pizza
✓ addLink: s=isBaseOf p=domain o=PizzaBase
✓ addLink: s=isBaseOf p=range o=Pizza
✓ addLink: s=hasBase p=type o=FunctionalProperty
✓ runLayout: elk-layered
✓ expandAll
✓ runLayout: elk-layered

Canvas: 24 nodes, 37 links
```

</details>

![owl:inverseOf — asserting pizza hasTopping mozz is enough; the reasoner adds mozz isToppingOf pizza for free](./pizza-tutorial/09-tbox-complete.svg)

---

**You:** The TBox is complete. Switch to ABox and add three untyped pizza individuals.

**Assistant:** The ABox is the instance data — real individuals, not classes.
We intentionally give the three pizzas no type. Their Pizza type will be inferred
by the reasoner from the domain of hasTopping and hasBase. This is the key lesson:
you don't have to state the obvious if the schema already says it.


<details>
<summary>5 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":77,"method":"tools/call","params":{"name":"setViewMode","arguments":{"mode":"abox"}}}`
`{"jsonrpc":"2.0","id":78,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#pizza1","label":"pizza1"}}}`
`{"jsonrpc":"2.0","id":79,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#pizza2","label":"pizza2"}}}`
`{"jsonrpc":"2.0","id":80,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#pizza3","label":"pizza3"}}}`
`{"jsonrpc":"2.0","id":81,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"dagre-lr","spacing":200}}}`

```tool-result
[VisGraph — 5 tools ✓]
✓ setViewMode
✓ addNode: http://www.pizza-ontology.com/pizza.owl#pizza1
✓ addNode: http://www.pizza-ontology.com/pizza.owl#pizza2
✓ addNode: http://www.pizza-ontology.com/pizza.owl#pizza3
✓ runLayout: dagre-lr

Canvas: 3 nodes, 0 links
```

</details>

![Three untyped individuals — no explicit Pizza type yet. The reasoner will derive it from the property domain.](./pizza-tutorial/10-abox-untyped-pizzas.svg)

---

**You:** Build pizza1 — a Margherita-style pizza. Add its toppings and base.

**Assistant:** Each topping individual is typed at the most specific leaf class only.
The subClassOf chain (e.g. MozzarellaTopping ⊆ CheeseTopping ⊆ PizzaTopping) means
we only assert the bottom level — the reasoner propagates membership upward.


<details>
<summary>9 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":82,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#mozz1","typeIri":"http://www.pizza-ontology.com/pizza.owl#MozzarellaTopping","label":"mozz"}}}`
`{"jsonrpc":"2.0","id":83,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#tom1","typeIri":"http://www.pizza-ontology.com/pizza.owl#TomatoTopping","label":"tomato"}}}`
`{"jsonrpc":"2.0","id":84,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#garlic1","typeIri":"http://www.pizza-ontology.com/pizza.owl#GarlicTopping","label":"garlic"}}}`
`{"jsonrpc":"2.0","id":85,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#thin1","typeIri":"http://www.pizza-ontology.com/pizza.owl#ThinAndCrispyBase","label":"thin & crispy"}}}`
`{"jsonrpc":"2.0","id":86,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza1","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#mozz1"}}}`
`{"jsonrpc":"2.0","id":87,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza1","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#tom1"}}}`
`{"jsonrpc":"2.0","id":88,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza1","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#garlic1"}}}`
`{"jsonrpc":"2.0","id":89,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza1","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasBase","objectIri":"http://www.pizza-ontology.com/pizza.owl#thin1"}}}`
`{"jsonrpc":"2.0","id":90,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"dagre-lr","spacing":180}}}`

```tool-result
[VisGraph — 9 tools ✓]
✓ addNode: http://www.pizza-ontology.com/pizza.owl#mozz1
✓ addNode: http://www.pizza-ontology.com/pizza.owl#tom1
✓ addNode: http://www.pizza-ontology.com/pizza.owl#garlic1
✓ addNode: http://www.pizza-ontology.com/pizza.owl#thin1
✓ addLink: s=pizza1 p=hasTopping o=mozz1
✓ addLink: s=pizza1 p=hasTopping o=tom1
✓ addLink: s=pizza1 p=hasTopping o=garlic1
✓ addLink: s=pizza1 p=hasBase o=thin1
✓ runLayout: dagre-lr

Canvas: 7 nodes, 4 links
```

</details>

![pizza1 (Margherita-style) — toppings typed only at leaf level; no type on pizza1 itself yet](./pizza-tutorial/11-pizza1-built.svg)

---

**You:** Now pizza2 — an AmericanHot-style pizza with peperoni, mozzarella, olive, and a deep pan base.

**Assistant:** Pizza2 has a meat topping alongside a cheese topping. The disjointWith axioms
we set on the categories don't fire here — Mozzarella is Cheese and Peperoni is Meat,
so no conflict.


<details>
<summary>9 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":91,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#pep1","typeIri":"http://www.pizza-ontology.com/pizza.owl#PeperoniSausageTopping","label":"peperoni"}}}`
`{"jsonrpc":"2.0","id":92,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#mozz2","typeIri":"http://www.pizza-ontology.com/pizza.owl#MozzarellaTopping","label":"mozz"}}}`
`{"jsonrpc":"2.0","id":93,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#olive1","typeIri":"http://www.pizza-ontology.com/pizza.owl#OliveTopping","label":"olive"}}}`
`{"jsonrpc":"2.0","id":94,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#deep1","typeIri":"http://www.pizza-ontology.com/pizza.owl#DeepPanBase","label":"deep pan"}}}`
`{"jsonrpc":"2.0","id":95,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza2","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#pep1"}}}`
`{"jsonrpc":"2.0","id":96,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza2","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#mozz2"}}}`
`{"jsonrpc":"2.0","id":97,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza2","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#olive1"}}}`
`{"jsonrpc":"2.0","id":98,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza2","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasBase","objectIri":"http://www.pizza-ontology.com/pizza.owl#deep1"}}}`
`{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"dagre-lr","spacing":180}}}`

```tool-result
[VisGraph — 9 tools ✓]
✓ addNode: http://www.pizza-ontology.com/pizza.owl#pep1
✓ addNode: http://www.pizza-ontology.com/pizza.owl#mozz2
✓ addNode: http://www.pizza-ontology.com/pizza.owl#olive1
✓ addNode: http://www.pizza-ontology.com/pizza.owl#deep1
✓ addLink: s=pizza2 p=hasTopping o=pep1
✓ addLink: s=pizza2 p=hasTopping o=mozz2
✓ addLink: s=pizza2 p=hasTopping o=olive1
✓ addLink: s=pizza2 p=hasBase o=deep1
✓ runLayout: dagre-lr

Canvas: 11 nodes, 8 links
```

</details>

![pizza2 (AmericanHot-style) — Meat and Cheese toppings are disjoint categories but can co-exist on one pizza](./pizza-tutorial/12-pizza2-built.svg)

---

**You:** And pizza3 — a FruttiDiMare with anchovies, tomato, and a thin base.

**Assistant:** Pizza3 gets a fish topping, completing our coverage of three different topping
categories across the three pizzas. After connecting, we lay out and expand the full ABox.


<details>
<summary>8 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":100,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#anch1","typeIri":"http://www.pizza-ontology.com/pizza.owl#AnchoviesTopping","label":"anchovies"}}}`
`{"jsonrpc":"2.0","id":101,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#tom2","typeIri":"http://www.pizza-ontology.com/pizza.owl#TomatoTopping","label":"tomato"}}}`
`{"jsonrpc":"2.0","id":102,"method":"tools/call","params":{"name":"addNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#thin2","typeIri":"http://www.pizza-ontology.com/pizza.owl#ThinAndCrispyBase","label":"thin & crispy"}}}`
`{"jsonrpc":"2.0","id":103,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza3","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#anch1"}}}`
`{"jsonrpc":"2.0","id":104,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza3","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasTopping","objectIri":"http://www.pizza-ontology.com/pizza.owl#tom2"}}}`
`{"jsonrpc":"2.0","id":105,"method":"tools/call","params":{"name":"addLink","arguments":{"subjectIri":"http://www.pizza-ontology.com/pizza.owl#pizza3","predicateIri":"http://www.pizza-ontology.com/pizza.owl#hasBase","objectIri":"http://www.pizza-ontology.com/pizza.owl#thin2"}}}`
`{"jsonrpc":"2.0","id":106,"method":"tools/call","params":{"name":"expandAll","arguments":{}}}`
`{"jsonrpc":"2.0","id":107,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"dagre-lr","spacing":180}}}`

```tool-result
[VisGraph — 8 tools ✓]
✓ addNode: http://www.pizza-ontology.com/pizza.owl#anch1
✓ addNode: http://www.pizza-ontology.com/pizza.owl#tom2
✓ addNode: http://www.pizza-ontology.com/pizza.owl#thin2
✓ addLink: s=pizza3 p=hasTopping o=anch1
✓ addLink: s=pizza3 p=hasTopping o=tom2
✓ addLink: s=pizza3 p=hasBase o=thin2
✓ expandAll
✓ runLayout: dagre-lr

Canvas: 14 nodes, 11 links
```

</details>

![ABox complete — three untyped pizzas, each with leaf-typed toppings and a base, ready for reasoning](./pizza-tutorial/13-abox-before-reasoning.svg)

---

**You:** Run the OWL-RL reasoner. What can it derive from the axioms we set?

**Assistant:** OWL-RL applies forward-chaining rules over the graph. Here is what each rule
fires on our data:

- **rdfs2 (domain):** pizza1/2/3 used hasTopping → their type is inferred as Pizza
- **rdfs3 (range):** toppings used as hasTopping objects → inferred as PizzaTopping
- **rdfs9 (subClassOf propagation):** mozz1 is MozzarellaTopping → also CheeseTopping → also PizzaTopping; anch1 is AnchoviesTopping → FishTopping → PizzaTopping; etc.
- **prp-inv (inverseOf):** every hasTopping edge generates an isToppingOf edge back; every hasBase edge generates an isBaseOf edge back


<details>
<summary>3 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":108,"method":"tools/call","params":{"name":"runReasoning","arguments":{}}}`
`{"jsonrpc":"2.0","id":109,"method":"tools/call","params":{"name":"expandAll","arguments":{}}}`
`{"jsonrpc":"2.0","id":110,"method":"tools/call","params":{"name":"runLayout","arguments":{"algorithm":"dagre-lr","spacing":180}}}`

```tool-result
[VisGraph — 3 tools ✓]
✓ runReasoning: 23028 triples inferred
✓ expandAll
✓ runLayout: dagre-lr

Canvas: 14 nodes, 36 links
```

</details>

![OWL-RL reasoning complete — Pizza types inferred, subClassOf chains climbed, all inverse edges materialised](./pizza-tutorial/14-after-reasoning.svg)

---

**You:** Focus on pizza1 and show what the reasoner gave it.

**Assistant:** Panning to pizza1 and expanding its card. The annotation panel will show
the inferred rdf:type Pizza alongside the isToppingOf back-links from all three toppings —
none of these were in our original assertions.


<details>
<summary>2 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":111,"method":"tools/call","params":{"name":"focusNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#pizza1"}}}`
`{"jsonrpc":"2.0","id":112,"method":"tools/call","params":{"name":"expandNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#pizza1","expand":true}}}`

```tool-result
[VisGraph — 2 tools ✓]
✓ focusNode
✓ expandNode

Canvas: 14 nodes, 36 links
```

</details>

![pizza1 gets type Pizza from the domain axiom — zero explicit type assertions needed](./pizza-tutorial/15-pizza1-inferred.svg)

---

**You:** Show mozz1 — does it know its full superclass chain?

**Assistant:** Focusing on mozz1 to confirm the three-level type propagation:
MozzarellaTopping (asserted) → CheeseTopping (rdfs9) → PizzaTopping (rdfs9).
Each step was derived automatically from the subClassOf chain in the TBox.


<details>
<summary>2 tool calls ✓</summary>

`{"jsonrpc":"2.0","id":113,"method":"tools/call","params":{"name":"focusNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#mozz1"}}}`
`{"jsonrpc":"2.0","id":114,"method":"tools/call","params":{"name":"expandNode","arguments":{"iri":"http://www.pizza-ontology.com/pizza.owl#mozz1","expand":true}}}`

```tool-result
[VisGraph — 2 tools ✓]
✓ focusNode
✓ expandNode

Canvas: 14 nodes, 36 links
```

</details>

![mozz1 — one asserted type, two inferred: MozzarellaTopping → CheeseTopping → PizzaTopping via subClassOf chain](./pizza-tutorial/16-mozz1-inferred.svg)
