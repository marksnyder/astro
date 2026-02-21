/**
 * Background images for the Astro chat area.
 * All images from Unsplash (https://unsplash.com) — used under the Unsplash License.
 */

const BACKGROUNDS = [
  // Forests
  { url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80', author: 'Sebastian Unrau', authorUrl: 'https://unsplash.com/@sebastian_unrau' },
  { url: 'https://images.unsplash.com/photo-1594760467061-b0c3e21d6a99?w=1920&q=80', author: 'Johannes Plenio', authorUrl: 'https://unsplash.com/@jplenio' },
  { url: 'https://images.unsplash.com/photo-1470115636492-6d2b56f9146d?w=1920&q=80', author: 'JOHN TOWNER', authorUrl: 'https://unsplash.com/@heytowner' },
  { url: 'https://images.unsplash.com/photo-1505028106030-e07ea1bd80c3?w=1920&q=80', author: 'Leo_Visions', authorUrl: 'https://unsplash.com/@leo_visions_' },
  { url: 'https://images.unsplash.com/photo-1541286347099-f75ffda21f00?w=1920&q=80', author: 'Pascal van de Vendel', authorUrl: 'https://unsplash.com/@pascalvendel' },
  { url: 'https://images.unsplash.com/photo-1620049308871-e09ede536c74?w=1920&q=80', author: 'Joyce G', authorUrl: 'https://unsplash.com/@yirage' },
  { url: 'https://images.unsplash.com/photo-1636829092009-0d7f5723877a?w=1920&q=80', author: 'Patrick Federi', authorUrl: 'https://unsplash.com/@federi' },
  { url: 'https://images.unsplash.com/photo-1476362555312-ab9e108a0b7e?w=1920&q=80', author: 'Thomas Griesbeck', authorUrl: 'https://unsplash.com/@jack_scorner' },

  // Mountains & valleys
  { url: 'https://images.unsplash.com/photo-1508108712903-49b7ef9b1df8?w=1920&q=80', author: 'Alessio Soggetti', authorUrl: 'https://unsplash.com/@asoggetti' },
  { url: 'https://images.unsplash.com/photo-1490100667990-4fced8021649?w=1920&q=80', author: 'Tobias Tullius', authorUrl: 'https://unsplash.com/@tobiastu' },
  { url: 'https://images.unsplash.com/photo-1504252060324-1c76e2e09939?w=1920&q=80', author: 'Vincent Guth', authorUrl: 'https://unsplash.com/@vingtcent' },
  { url: 'https://images.unsplash.com/photo-1684717465603-b47bf0e8138f?w=1920&q=80', author: 'Navin Hardyal', authorUrl: 'https://unsplash.com/@navinhardyal' },
  { url: 'https://images.unsplash.com/photo-1675652202189-d33f7fa075f0?w=1920&q=80', author: 'Jude Infantini', authorUrl: 'https://unsplash.com/@judowoodo_' },
  { url: 'https://images.unsplash.com/photo-1770055438057-99d5d9c6d302?w=1920&q=80', author: 'Muhammet Cengiz', authorUrl: 'https://unsplash.com/@muhammetcengiz' },
  { url: 'https://images.unsplash.com/photo-1433077279279-9354d2d72f6b?w=1920&q=80', author: 'Jasper Boer', authorUrl: 'https://unsplash.com/@jasperboer' },
  { url: 'https://images.unsplash.com/photo-1712244131341-2d9fd62bb6d3?w=1920&q=80', author: 'Christopher Stites', authorUrl: 'https://unsplash.com/@christopherstites' },

  // Lakes & reflections
  { url: 'https://images.unsplash.com/photo-1683041133891-613b76cbebc7?w=1920&q=80', author: 'Sergei Gussev', authorUrl: 'https://unsplash.com/@sergeigussev' },
  { url: 'https://images.unsplash.com/photo-1635363544070-a799859f0495?w=1920&q=80', author: 'Andreas Weilguny', authorUrl: 'https://unsplash.com/@weilguni' },
  { url: 'https://images.unsplash.com/photo-1655408780315-f9f5beb0af88?w=1920&q=80', author: 'Péter Andi', authorUrl: 'https://unsplash.com/@peterandy' },
  { url: 'https://images.unsplash.com/photo-1621001481340-1e7b901389c5?w=1920&q=80', author: 'Eugene Chow', authorUrl: 'https://unsplash.com/@eugenechow' },
  { url: 'https://images.unsplash.com/photo-1631551437792-ae5a0fb41c49?w=1920&q=80', author: 'Zhi Sun', authorUrl: 'https://unsplash.com/@sunzhi' },
  { url: 'https://images.unsplash.com/photo-1752087022364-0882c43b1933?w=1920&q=80', author: 'Piotr Musioł', authorUrl: 'https://unsplash.com/@piotrek_m' },
  { url: 'https://images.unsplash.com/photo-1752087021698-df3e90af3fb2?w=1920&q=80', author: 'Piotr Musioł', authorUrl: 'https://unsplash.com/@piotrek_m' },
  { url: 'https://images.unsplash.com/photo-1698362696286-c1557f477e96?w=1920&q=80', author: 'Stacie Ong', authorUrl: 'https://unsplash.com/@stacieong' },

  // Meadows & hills
  { url: 'https://images.unsplash.com/photo-1673144632480-2edd4b5a2621?w=1920&q=80', author: 'Simon Hurry', authorUrl: 'https://unsplash.com/@simonhurry' },
  { url: 'https://images.unsplash.com/photo-1603346996604-cd77fc859e1d?w=1920&q=80', author: 'Erik van Dijk', authorUrl: 'https://unsplash.com/@erikvandijk' },
  { url: 'https://images.unsplash.com/photo-1572091363942-514a9f4c752d?w=1920&q=80', author: 'Kieran Sheehan', authorUrl: 'https://unsplash.com/@kieran_sheehan' },
  { url: 'https://images.unsplash.com/photo-1642532959702-417e8318ca9f?w=1920&q=80', author: 'Meszárcsek Gergely', authorUrl: 'https://unsplash.com/@meszarcsek' },
  { url: 'https://images.unsplash.com/photo-1578853464641-ef3e6d47e16c?w=1920&q=80', author: 'Nikola Johnny Mirkovic', authorUrl: 'https://unsplash.com/@nikolajonny' },
  { url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1920&q=80', author: 'Federico Respini', authorUrl: 'https://unsplash.com/@federicorespini' },
  { url: 'https://images.unsplash.com/photo-1719906629254-062ca203e85c?w=1920&q=80', author: 'Gavin Allanwood', authorUrl: 'https://unsplash.com/@gavla' },
  { url: 'https://images.unsplash.com/photo-1659809665246-fdb7cc3fa782?w=1920&q=80', author: 'Dave LZ', authorUrl: 'https://unsplash.com/@dlzphoto' },

  // Sunrises & sunsets
  { url: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1920&q=80', author: 'Dawid Zawiła', authorUrl: 'https://unsplash.com/@davealmine' },
  { url: 'https://images.unsplash.com/photo-1725743276323-9e3a1eaabd73?w=1920&q=80', author: 'admiratio', authorUrl: 'https://unsplash.com/@admiratio' },
  { url: 'https://images.unsplash.com/photo-1477348188230-3b118ccff845?w=1920&q=80', author: 'Justin Lawrence', authorUrl: 'https://unsplash.com/@justinlawrence' },

  // Waterfalls & rivers
  { url: 'https://images.unsplash.com/photo-1610044850302-07625664a2dc?w=1920&q=80', author: 'LIVESTART STIVEN', authorUrl: 'https://unsplash.com/@livestart_stiven' },
  { url: 'https://images.unsplash.com/photo-1620436772501-46fcd04b74f6?w=1920&q=80', author: 'Zoe Graham', authorUrl: 'https://unsplash.com/@zoegraham' },
  { url: 'https://images.unsplash.com/photo-1673408199815-cd4161eb85fb?w=1920&q=80', author: 'Brice Cooper', authorUrl: 'https://unsplash.com/@bricecooper' },
  { url: 'https://images.unsplash.com/photo-1628344253777-f73a64d8f983?w=1920&q=80', author: 'Leon Lønsetteig', authorUrl: 'https://unsplash.com/@leon_lonsetteig' },
  { url: 'https://images.unsplash.com/photo-1653149875988-4fc5dff7a2cf?w=1920&q=80', author: 'Anvesh Uppunuthula', authorUrl: 'https://unsplash.com/@anvesh_uppunuthula' },

  // Coast & ocean
  { url: 'https://images.unsplash.com/photo-1621887807833-e1f04bfe1043?w=1920&q=80', author: 'Eugene', authorUrl: 'https://unsplash.com/@eugene_gak' },
  { url: 'https://images.unsplash.com/photo-1612280456186-1d4ce50d113e?w=1920&q=80', author: 'Dicky Satria', authorUrl: 'https://unsplash.com/@dickysatria' },
  { url: 'https://images.unsplash.com/photo-1735094365748-07b16a185749?w=1920&q=80', author: 'Afif Ramdhasuma', authorUrl: 'https://unsplash.com/@jfrramdhasuma' },
  { url: 'https://images.unsplash.com/photo-1726166910176-17e17cb522f9?w=1920&q=80', author: 'Bernd Dittrich', authorUrl: 'https://unsplash.com/@bernd_dittrich' },

  // Lavender fields
  { url: 'https://images.unsplash.com/photo-1499002238440-d264edd596ec?w=1920&q=80', author: 'Léonard Cotte', authorUrl: 'https://unsplash.com/@leonardcotte' },
  { url: 'https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=1920&q=80', author: 'Mark Harpur', authorUrl: 'https://unsplash.com/@luckybeanz' },
  { url: 'https://images.unsplash.com/photo-1445510491599-c391e8046a68?w=1920&q=80', author: 'Annie Spratt', authorUrl: 'https://unsplash.com/@anniespratt' },

  // Northern lights
  { url: 'https://images.unsplash.com/photo-1715533540804-cd567804e4fe?w=1920&q=80', author: 'Ian Mackey', authorUrl: 'https://unsplash.com/@ianmackey' },
  { url: 'https://images.unsplash.com/photo-1568021735466-efd8a4c435af?w=1920&q=80', author: 'Sami Matias Breilin', authorUrl: 'https://unsplash.com/@samimatias' },
  { url: 'https://images.unsplash.com/photo-1593069832911-8d1ffe689530?w=1920&q=80', author: 'Chris-Håvard Berge', authorUrl: 'https://unsplash.com/@chrisharvard' },

  // Desert
  { url: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1920&q=80', author: 'Ganapathy Kumar', authorUrl: 'https://unsplash.com/@gkumar' },
  { url: 'https://images.unsplash.com/photo-1542401886-65d6c61db217?w=1920&q=80', author: 'Wolfgang Hasselmann', authorUrl: 'https://unsplash.com/@wolfgang_hasselmann' },
  { url: 'https://images.unsplash.com/photo-1547234935-80c7145ec969?w=1920&q=80', author: 'Juli Kosolapova', authorUrl: 'https://unsplash.com/@yuli_superson' },
]

export default BACKGROUNDS
