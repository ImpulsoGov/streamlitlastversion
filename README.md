# Bem Vindo ao Streamlit :wave:

**MODIFICADO PELA IMPULSO GOV**

Os arquivos na pasta builds, são arquivos wheel com versões modificadas da Impulso. Abaixo pode-se observar as alteracões do código fonte.

- **streamlit-0.69.2-py2.py3-none-any.whl**

  A modificação permite que uma pasta chamada "recursos" no mesmo caminho de onde o script foi executado, sirva como pasta estática para o servidor. É acessível através de / resources.
  Primeira versão alterada usada no FarolCovid, para ler mais [veja aqui](https://docs.google.com/document/d/1bJh2Tk76E2TP7X9HZYajOM21FLln_keD7H6Yq8tgq9g/edit#).


- **streamlit-0.70.0-py2.py3-none-any.whl**

  Modificacão focada em detalhes técnicos como data de funcões e linguagem. Arquivos modificados:
  - */streamlit/static/index.html*: mudança de linguagem padrão para pt-br, nome e descricao do site.
  - */streamlit/config.py*: funcão *_create_option* para aumentar *expiration_date*.
  Primeira versão do Escola Segura.


- **streamlit-0.70.1-py2.py3-none-any.whl**

  Modificacão focada em alterar cores e tamanhos de letras padrões streamlit, para se adequar a paleta do site.
  Segunda versão do Escola Segura.
  - */streamlit/assets/streamlit.css*: mudança da cor rosa para verde padrão e tamanho da letra de perguntas.


## License

Streamlit is completely free and open source and licensed under the [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.
