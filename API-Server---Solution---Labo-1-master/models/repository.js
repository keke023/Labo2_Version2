///////////////////////////////////////////////////////////////////////////
// This class provide CRUD operations on JSON objects collection text file
// with the assumption that each object have an Id member.
// If the objectsFile does not exist it will be created on demand.
/////////////////////////////////////////////////////////////////////
// Author : Nicolas Chourot
// Lionel-Groulx College
/////////////////////////////////////////////////////////////////////

const fs = require("fs");
const utilities = require("../utilities.js");

class Repository {
  constructor(model) {
    this.objectsList = null;
    this.model = model;
    this.objectsName = model.getClassName() + "s";
    this.objectsFile = `./data/${this.objectsName}.json`;
    this.bindExtraDataMethod = null;
    this.updateResult = {
      ok: 0,
      conflict: 1,
      notFound: 2,
      invalid: 3,
    };
  }

  setBindExtraDataMethod(bindExtraDataMethod) {
    this.bindExtraDataMethod = bindExtraDataMethod;
  }

  objects() {
    if (this.objectsList == null) this.read();
    return this.objectsList;
  }

  read() {
    try {
      let rawdata = fs.readFileSync(this.objectsFile);
      // we assume here that the json data is formatted correctly
      this.objectsList = JSON.parse(rawdata);
    } catch (error) {
      if (error.code === "ENOENT") {
        // file does not exist, it will be created on demand
        log(
          FgYellow,
          `Warning ${this.objectsName} repository does not exist. It will be created on demand`
        );
        this.objectsList = [];
      } else {
        log(
          Bright,
          FgRed,
          `Error while reading ${this.objectsName} repository`
        );
        log(
          Bright,
          FgRed,
          "--------------------------------------------------"
        );
        log(Bright, FgRed, error);
      }
    }
  }

  write() {
    fs.writeFileSync(this.objectsFile, JSON.stringify(this.objectsList));
  }

  nextId() {
    let maxId = 0;
    for (let object of this.objects()) {
      if (object.Id > maxId) {
        maxId = object.Id;
      }
    }
    return maxId + 1;
  }

  add(object) {
    try {
      if (this.model.valid(object)) {
        let conflict = false;
        if (this.model.key) {
          conflict =
            this.findByField(this.model.key, object[this.model.key]) != null;
        }
        if (!conflict) {
          object.Id = this.nextId();
          this.objectsList.push(object);
          this.write();
        } else {
          object.conflict = true;
        }
        return object;
      }
      return null;
    } catch (error) {
      console.log(
        FgRed,
        `Error adding new item in ${this.objectsName} repository`
      );
      console.log(
        FgRed,
        "-------------------------------------------------------"
      );
      console.log(Bright, FgRed, error);
      return null;
    }
  }

  update(objectToModify) {
    if (this.model.valid(objectToModify)) {
      let conflict = false;
      if (this.model.key) {
        conflict =
          this.findByField(
            this.model.key,
            objectToModify[this.model.key],
            objectToModify.Id
          ) != null;
      }
      if (!conflict) {
        let index = 0;
        for (let object of this.objects()) {
          if (object.Id === objectToModify.Id) {
            this.objectsList[index] = objectToModify;
            this.write();
            return this.updateResult.ok;
          }
          index++;
        }
        return this.updateResult.notFound;
      } else {
        return this.updateResult.conflict;
      }
    }
    return this.updateResult.invalid;
  }

  remove(id) {
    let index = 0;
    for (let object of this.objects()) {
      if (object.Id === id) {
        this.objectsList.splice(index, 1);
        this.write();
        return true;
      }
      index++;
    }
    return false;
  }

  getAll(params = null) {
    let objectsList = this.objects();
    if (this.bindExtraDataMethod != null) {
      objectsList = this.bindExtraData(objectsList);
    }
    if (params) {
      let model = this.model;
      let filteredAndSortedObjects = [];
      // TODO Laboratoire 2
      let sortKeys = [];
      let searchKeys = [];
      Object.keys(params).forEach(function (paramName) {
        if (paramName == "sort") {
          let keyValues = params[paramName];
          if (Array.isArray(keyValues)) {
            for (let key of keyValues) {
              let values = key.split(",");
              let descendant = values.length > 1 && values[1] == "desc";
              sortKeys.push({ key: values[0], asc: !descendant });
            }
          } else {
            let value = keyValues.split(",");
            let descendant = value.length > 1 && value[1] == "desc";
            sortKeys.push({ key: value[0], asc: !descendant });
          }
        } else {
          // todo add search key
          if (paramName in model)
            searchKeys.push({ key: paramName, value: params[paramName] });
        }
      });

      // todo filter

      
      if(searchKeys.length > 0)
      {
        for (let object of objectsList) {
          let valueMatch= 0;
          for (let searchKey of searchKeys) {
            
            if(this.valueMatch(object[searchKey.key],searchKey.value))
            {
              valueMatch++
              if(valueMatch == searchKeys.length)
              {
                filteredAndSortedObjects.push(object);
                valueMatch =0;
              }
             
            }
          }
        }
      }
      // todo sort

      if(sortKeys.length > 0)
      {
        if(searchKeys.length>0)
        {
          filteredAndSortedObjects = this.sortObjectList(filteredAndSortedObjects,sortKeys);
         
        }
        else
        {
          filteredAndSortedObjects = this.sortObjectList(objectsList,sortKeys);
        }

      }

      return filteredAndSortedObjects;
    }
    return objectsList;
  }

  sortObjectList(objectsList, sortKeys)
  {
    this.sortFields = sortKeys;
   let objectListSorted = [...objectsList].sort((a,b)=>
    {
      return this.compare(a,b);
    });
    return objectListSorted;
  }

  valueMatch(value, searchValue) {
    try {
      return new RegExp(
        "^" + searchValue.toLowerCase().replace(/\*/g, ".*") + "$"
      ).test(value.toString().toLowerCase());
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  compareNum(x, y) {
    if (x === y) return 0;
    else if (x < y) return -1;
    return 1;
  }
  innerCompare(x, y) {
    if (typeof x === "string") return x.localeCompare(y);
    else return this.compareNum(x, y);
  }

  compare(itemX, itemY) {
    let fieldIndex = 0;
    let max = this.sortFields.length;

    do {
      let result = 0;
      if (this.sortFields[fieldIndex].asc)
        result = this.innerCompare(
          itemX[this.sortFields[fieldIndex].key],
          itemY[this.sortFields[fieldIndex].key]
        );
      else
        result = this.innerCompare(
          itemY[this.sortFields[fieldIndex].key],
          itemX[this.sortFields[fieldIndex].key]
        );
      if (result == 0) fieldIndex++;
      else return result;
    } while (fieldIndex < max);
    return 0;
  }

  get(id) {
    for (let object of this.objects()) {
      if (object.Id === id) {
        if (this.bindExtraDataMethod != null)
          return this.bindExtraDataMethod(object);
        else return object;
      }
    }
    return null;
  }
  removeByIndex(indexToDelete) {
    if (indexToDelete.length > 0) {
      utilities.deleteByIndex(this.objects(), indexToDelete);
      this.write();
    }
  }

  findByField(fieldName, value, excludedId = 0) {
    if (fieldName) {
      let index = 0;
      for (let object of this.objects()) {
        try {
          if (object[fieldName] === value) {
            if (object.Id != excludedId) return this.objectsList[index];
          }
          index++;
        } catch (error) {
          break;
        }
      }
    }
    return null;
  }
}

module.exports = Repository;
