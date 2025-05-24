## Dependencies
1. `python -m venv venv #Create a virutal environment`
   1. `source venv/bin/activate #activate venv - Assuming bash, see [Python Docs](https://docs.python.org/3/library/venv.html) for more info`
2. `pip install Flask scanpy anndata "louvain<0.8.0" leidenalg python-igraph matplotlib pandas`
    1. You may have to install packages to your OS (assuming Ubuntu) for any dependenceis (leidenalg, etc.)

## How to run the app
1. `git clone git@github.com:nnazeem/omics-odyssey-sp25.git`
2. `cd hackathon_bioinfo_project`
2. `python app.py #Wait for the app to run; click on the address from the terminal output to open website`

Uploaded `.h5ad` as test data to website from: https://figshare.com/articles/dataset/MS_CSF_h5ad/14356661?file=27405182

