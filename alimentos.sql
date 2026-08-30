-- ============================================================
--  MF Performance — Base de alimentos (valores por 100 g / 100 ml)
--  Tabelas de composição brasileiras (TACO/IBGE), arredondados para uso
--  prático em consultório. owner_id null = base compartilhada: todo
--  treinador enxerga e ninguém apaga por engano.
--  Idempotente: pode rodar de novo sem duplicar.
-- ============================================================
with dados as (
  select trim(split_part(l,'|',1)) nome,
         trim(split_part(l,'|',2)) cat,
         nullif(trim(split_part(l,'|',3)),'')::numeric kcal,
         nullif(trim(split_part(l,'|',4)),'')::numeric prot,
         nullif(trim(split_part(l,'|',5)),'')::numeric carb,
         nullif(trim(split_part(l,'|',6)),'')::numeric gord,
         nullif(trim(split_part(l,'|',7)),'') prep
    from unnest(string_to_array($csv$Peito de frango grelhado|Proteínas|165|31|0|3.6|Sem pele. 100 g cru ≈ 70 g cozido
Peito de frango cru|Proteínas|119|22|0|2.5|Sem pele
Coxa de frango assada s/ pele|Proteínas|184|25|0|8.6|
Sobrecoxa assada s/ pele|Proteínas|211|24|0|12|
Patinho moído cozido|Proteínas|219|32|0|9|Escorra a gordura depois de refogar
Patinho cru|Proteínas|133|21|0|5|
Alcatra grelhada|Proteínas|241|32|0|12|
Contrafilé grelhado|Proteínas|278|32|0|16|
Coxão mole cozido|Proteínas|219|35|0|8|
Músculo cozido|Proteínas|194|30|0|7.6|Bom para panela de pressão
Lombo suíno assado|Proteínas|210|32|0|8.5|
Filé de tilápia grelhado|Proteínas|128|26|0|2.6|
Salmão grelhado|Proteínas|211|23|0|13|Rico em ômega 3
Sardinha em lata (em óleo, escorrida)|Proteínas|208|24|0|12|Escorra bem o óleo
Atum em lata em água|Proteínas|116|26|0|1|Escorra a água
Merluza cozida|Proteínas|109|23|0|1.5|
Camarão cozido|Proteínas|99|21|0|1.4|
Ovo de galinha inteiro cozido|Proteínas|146|13|0.6|10|1 unidade ≈ 50 g
Clara de ovo cozida|Proteínas|52|11|0.7|0.2|1 clara ≈ 33 g
Ovo mexido (sem óleo)|Proteínas|153|13|1|10|Frigideira antiaderente
Peito de peru defumado|Proteínas|95|17|2|2|Prefira as versões com menos sódio
Presunto magro|Proteínas|120|17|1|5|
Carne seca dessalgada cozida|Proteínas|194|32|0|7|Deixe de molho trocando a água
Fígado bovino grelhado|Proteínas|180|27|4|5|Rico em ferro e vitamina A
Leite integral|Laticínios|61|3.2|4.7|3.3|1 copo ≈ 200 ml
Leite desnatado|Laticínios|35|3.4|4.9|0.2|
Iogurte natural integral|Laticínios|61|3.5|4.7|3.3|
Iogurte natural desnatado|Laticínios|41|4.1|5.7|0.2|
Iogurte grego natural (sem açúcar)|Laticínios|97|9|3.6|5|
Queijo cottage|Laticínios|98|11|3.4|4.3|
Queijo minas frescal|Laticínios|264|17|3.2|20|
Ricota|Laticínios|140|11|3.8|8|
Queijo muçarela|Laticínios|280|22|3|20|
Requeijão light|Laticínios|180|10|4|13|
Whey protein concentrado (pó)|Suplementos|400|75|10|6|1 scoop ≈ 30 g
Whey protein isolado (pó)|Suplementos|373|88|2|1|1 scoop ≈ 30 g
Caseína (pó)|Suplementos|370|78|7|2|
Albumina (pó)|Suplementos|375|80|5|1|
Creatina monoidratada|Suplementos|0|0|0|0|3 a 5 g por dia, com água
Arroz branco cozido|Carboidratos|128|2.5|28|0.2|4 col. sopa ≈ 100 g
Arroz integral cozido|Carboidratos|124|2.6|26|1|
Arroz parboilizado cozido|Carboidratos|123|2.5|27|0.3|
Macarrão cozido|Carboidratos|158|5.8|30|0.9|Al dente tem índice glicêmico menor
Macarrão integral cozido|Carboidratos|149|6|29|1.1|
Batata inglesa cozida|Carboidratos|52|1.2|12|0.1|
Batata doce cozida|Carboidratos|77|0.6|18|0.1|
Mandioca cozida|Carboidratos|125|0.6|30|0.3|
Inhame cozido|Carboidratos|97|2.1|23|0.1|
Cará cozido|Carboidratos|106|2.3|25|0.2|
Pão francês|Carboidratos|300|8|58|3.1|1 unidade ≈ 50 g
Pão de forma integral|Carboidratos|253|9.4|44|3.7|1 fatia ≈ 25 g
Pão de forma branco|Carboidratos|270|8|50|3.5|1 fatia ≈ 25 g
Tapioca (goma hidratada)|Carboidratos|240|0|60|0|1 tapioca média ≈ 50 g de goma
Cuscuz de milho cozido|Carboidratos|113|2.4|25|0.5|
Aveia em flocos|Carboidratos|394|14|67|8.5|3 col. sopa ≈ 30 g
Granola sem açúcar|Carboidratos|420|10|64|13|
Farinha de aveia|Carboidratos|389|14|66|7|
Quinoa cozida|Carboidratos|120|4.4|21|1.9|
Milho verde cozido|Carboidratos|98|3.2|20|1.2|
Polenta cozida|Carboidratos|83|1.8|18|0.3|
Torrada integral|Carboidratos|377|12|68|6|1 torrada ≈ 8 g
Biscoito de arroz|Carboidratos|387|8|81|3|1 unidade ≈ 7 g
Panqueca de banana e aveia|Carboidratos|180|6|26|5|1 ovo + 1 banana + 2 col. aveia
Feijão carioca cozido|Leguminosas|76|4.8|13|0.5|1 concha ≈ 80 g
Feijão preto cozido|Leguminosas|77|4.5|14|0.5|
Lentilha cozida|Leguminosas|93|6.3|16|0.5|
Grão-de-bico cozido|Leguminosas|164|8.9|27|2.6|
Ervilha cozida|Leguminosas|81|5.4|14|0.4|
Soja cozida|Leguminosas|173|16|10|9|
Proteína de soja texturizada (seca)|Leguminosas|336|50|30|1.5|Hidrate antes de refogar
Tofu|Leguminosas|76|8|1.9|4.8|
Brócolis cozido|Legumes e verduras|25|2.1|4|0.3|
Couve-flor cozida|Legumes e verduras|23|1.8|3.9|0.3|
Abobrinha refogada|Legumes e verduras|26|1.1|4.3|0.6|
Berinjela cozida|Legumes e verduras|25|0.7|5.7|0.2|
Cenoura crua|Legumes e verduras|34|1.3|7.7|0.2|
Cenoura cozida|Legumes e verduras|30|0.8|6.7|0.2|
Chuchu cozido|Legumes e verduras|19|0.4|4.8|0.1|
Tomate cru|Legumes e verduras|15|1.1|3.1|0.2|
Alface|Legumes e verduras|11|1.3|1.7|0.2|
Rúcula|Legumes e verduras|13|1.8|2.2|0.3|
Couve refogada|Legumes e verduras|90|2.8|5.9|7|Com pouco azeite
Espinafre cozido|Legumes e verduras|23|2.7|3.4|0.3|
Repolho cru|Legumes e verduras|25|1.3|5.8|0.1|
Pepino|Legumes e verduras|10|0.9|2|0.1|
Pimentão cru|Legumes e verduras|21|1.1|4.9|0.2|
Beterraba cozida|Legumes e verduras|32|1.3|7.2|0.1|
Abóbora cozida|Legumes e verduras|48|1.4|12|0.1|
Vagem cozida|Legumes e verduras|25|1.8|5.3|0.2|
Quiabo cozido|Legumes e verduras|30|1.9|6.4|0.3|
Cebola crua|Legumes e verduras|39|1.7|8.9|0.1|
Banana prata|Frutas|98|1.3|26|0.1|1 unidade média ≈ 70 g
Banana nanica|Frutas|92|1.4|23|0.1|
Maçã com casca|Frutas|56|0.3|15|0.4|1 unidade média ≈ 130 g
Mamão papaia|Frutas|40|0.5|10|0.1|
Laranja pera|Frutas|37|1|8.9|0.1|1 unidade ≈ 130 g
Melancia|Frutas|33|0.9|8.1|0.1|
Melão|Frutas|29|0.7|7.5|0|
Abacaxi|Frutas|48|0.9|12|0.1|
Manga|Frutas|64|0.4|16|0.2|
Uva|Frutas|53|0.7|14|0.2|
Morango|Frutas|30|0.9|6.8|0.3|
Abacate|Frutas|96|1.2|6|8.4|Rico em gordura boa; cuidado com a porção
Pera|Frutas|53|0.6|14|0.1|
Kiwi|Frutas|51|1.3|11|0.6|
Goiaba vermelha|Frutas|54|1.1|13|0.4|
Açaí polpa (sem açúcar)|Frutas|58|0.8|6.2|3.9|
Coco fresco|Frutas|354|3.3|15|33|
Ameixa seca|Frutas|240|2.2|64|0.4|
Uva passa|Frutas|299|3.1|79|0.5|
Azeite de oliva extravirgem|Gorduras e oleaginosas|884|0|0|100|1 col. sopa ≈ 13 g
Óleo de soja|Gorduras e oleaginosas|884|0|0|100|
Óleo de coco|Gorduras e oleaginosas|862|0|0|100|
Manteiga|Gorduras e oleaginosas|760|0.6|0.1|84|
Castanha-do-pará|Gorduras e oleaginosas|643|14|15|63|2 unidades por dia já bastam (selênio)
Castanha de caju|Gorduras e oleaginosas|570|18|29|46|
Amendoim torrado|Gorduras e oleaginosas|544|23|20|44|
Pasta de amendoim integral|Gorduras e oleaginosas|588|25|20|50|1 col. sopa ≈ 15 g
Amêndoa|Gorduras e oleaginosas|581|21|20|50|
Nozes|Gorduras e oleaginosas|620|14|18|59|
Chia|Gorduras e oleaginosas|486|17|42|31|Deixe hidratar antes
Linhaça|Gorduras e oleaginosas|495|14|43|32|Moída absorve melhor
Semente de abóbora|Gorduras e oleaginosas|559|30|11|49|
Maionese tradicional|Gorduras e oleaginosas|680|1|2|75|
Água|Bebidas|0|0|0|0|
Café sem açúcar|Bebidas|2|0.2|0.3|0|
Chá sem açúcar|Bebidas|1|0|0.2|0|
Água de coco|Bebidas|22|0.7|5.3|0.1|
Suco de laranja natural|Bebidas|45|0.7|10|0.2|Prefira a fruta inteira
Leite vegetal de amêndoas s/ açúcar|Bebidas|15|0.5|0.6|1.2|
Refrigerante comum|Doces e ultraprocessados|42|0|10.6|0|Sem valor nutricional; evite
Cerveja|Bebidas|43|0.5|3.6|0|
Chocolate ao leite|Doces e ultraprocessados|540|7|59|30|
Chocolate 70% cacau|Doces e ultraprocessados|560|8|45|38|
Açúcar refinado|Doces e ultraprocessados|387|0|100|0|1 col. chá ≈ 5 g
Mel|Doces e ultraprocessados|309|0.4|84|0|
Sorvete de creme|Doces e ultraprocessados|207|3.5|23|11|
Biscoito recheado|Doces e ultraprocessados|472|6|70|19|
Salgadinho de pacote|Doces e ultraprocessados|530|6|55|32|
Pizza mussarela (fatia)|Doces e ultraprocessados|266|11|33|10|1 fatia ≈ 100 g
Hambúrguer de fast-food|Doces e ultraprocessados|295|15|30|13|
Pão de queijo|Doces e ultraprocessados|363|5|38|21|1 unidade média ≈ 30 g
Sal|Outros|0|0|0|0|Máx. 5 g por dia (1 col. chá)
Alho|Outros|113|7|24|0.5|
Vinagre|Outros|19|0|0.9|0|
Molho de tomate sem açúcar|Outros|38|1.5|7|0.4|
Cacau em pó 100%|Outros|228|20|58|14|
Gelatina sem açúcar pronta|Outros|7|1.5|0|0|$csv$, E'\n')) l
   where trim(l) <> ''
),
novos as (
  insert into public.foods (owner_id, name, category, unit, kcal, protein, carb, fat, preparo)
  select null, d.nome, d.cat, '100 g', d.kcal, d.prot, d.carb, d.gord, d.prep
    from dados d
   where not exists (select 1 from public.foods f where f.owner_id is null and lower(f.name)=lower(d.nome))
  returning 1
)
update public.foods f
   set category=d.cat, kcal=d.kcal, protein=d.prot, carb=d.carb, fat=d.gord,
       preparo=coalesce(d.prep, f.preparo)
  from dados d
 where f.owner_id is null and lower(f.name)=lower(d.nome);
