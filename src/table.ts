import { RowDataPacket } from "mysql2";
import { Database } from "./database";
import { GetPrimaryKey, InternalParsedSchema, JSONData, MySQLDeserializationMap, MySQLSerializationMap, SchemaValue, SchemaPartial, Schema, SchemaTypeToValue } from "./schema-types";

// i suggest you use some form of mapping per type, to make the js <-> mysql conversions easier

// mysql value --> javascript value
const mysqlDeserializationMap: MySQLDeserializationMap = {
  // int: (value) => value,
  // double: (value) => value,
  boolean: (value) => (value > 0),
  date: (value) => new Date(value),
  dateTime: (value) => new Date(value),
  // timeStamp: (value) => value,
  time: (value) => new Date('1970-01-01 ' + value),
  // text: (value) => value,
  // mediumText: (value) => value,
  // longText: (value) => value,
  // varChar: (value) => value,
  // char: (value) => value,
  json: (value) => JSON.parse(value),
}
// javascript value --> mysql value
const mysqlSerializationMap: MySQLSerializationMap = {
  // int: (value) => value,
  // double: (value) => value,
  // boolean: (value) => value,
  date: (value) => `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`,
  dateTime: (value) => `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()} ${value.getHours()}:${value.getMinutes()}:${value.getSeconds()}`,
  // timeStamp: (value) => value,
  time: (value) => `${value.getHours()}:${value.getMinutes()}:${value.getSeconds()}`,
  // text: (value) => value,
  // mediumText: (value) => value,
  // longText: (value) => value,
  // varChar: (value) => value,
  // char: (value) => value,
  json: (value) => JSON.stringify(value),
}

export class Table<S extends Schema> {
  static JSON = <Data>() => 'json' as any as JSONData<Data>;

  private name: string;
  private db: Database;
  private primaryKey!: string;
  private types: InternalParsedSchema;

  constructor(name: string, database: Database, schema: S) {
    this.name = name;
    this.db = database;
    this.types = {};
    Object.keys(schema).forEach(key => {
      const value = schema[key];
      const obj = {} as InternalParsedSchema[string];

      let type: string;
      if (Array.isArray(value)) {
        type = value[0];
        obj.args = value.slice(1);
      } else {
        type = value.toString();
      }

      const parts = type.split(' ');
      if (parts.length === 1) {
        obj.type = parts[0] as any;
      } else {
        (obj as any)[parts[0]] = true;
        obj.type = parts[1] as any;

        if (obj.primary) {
          this.primaryKey = key;
        }
      }

      this.types[key] = obj;
    });

    if (!this.primaryKey) {
      throw new Error("A Primary Key is required.");
    }

    //await this.db.__query(`CREATE TABLE ? IF NOT EXISTS`)
  }

  private deserializeRow(row: RowDataPacket): SchemaValue<S> {
    for (let k in row) {
      row[k] = (mysqlDeserializationMap[this.types[k].type] || ((x: any) => x))(row[k])
    }
    return <SchemaValue<S>>row;
  }

  private serializeRow(row: SchemaValue<S> | SchemaPartial<S>): Object {
    for (let k in row) {
      row[k] = (mysqlSerializationMap[this.types[k].type] || ((x: any) => x))(row[k])
    }
    return row;
  }

  async get(primaryKey: SchemaTypeToValue<S[GetPrimaryKey<S>]>): Promise<SchemaValue<S> | null> {
    let results = <RowDataPacket[]>await this.db._query(`SELECT * FROM ${this.name} WHERE ? = ?;`, [this.primaryKey, primaryKey]);
    if (results.length < 0) return null;
    return this.deserializeRow(results[0]);
  }

  async getAll<K extends Exclude<keyof S, GetPrimaryKey<S>>>(key: K, value: SchemaTypeToValue<S[K]>): Promise<SchemaValue<S>[]> {
    let results = <RowDataPacket[]>await this.db._query(`SELECT * FROM ${this.name} WHERE ? = ?;`, [key, value]);
    let newResults = [];
    for (let row of results) {
      newResults.push(this.deserializeRow(row));
    }
    return newResults;
  }

  async insert(object: SchemaValue<S>): Promise<void> {
    await this.db._query(`INSERT INTO ${this.name} SET ?`, [this.serializeRow(object)]);
  }

  async update(object: SchemaPartial<S>): Promise<void> {
    await this.db._query(`UPDATE ${this.name} SET ? WHERE ? = ?`, [this.serializeRow(object), this.primaryKey, object[this.primaryKey]]);
  }

  async delete(primaryKey: GetPrimaryKey<S>): Promise<void> {
    await this.db._query(`DELETE FROM ${this.name} WHERE ? = ?;`, [this.name, this.primaryKey, primaryKey]);
  }

}

export type TableValue<T extends Table<any>> = T extends Table<infer S> ? SchemaValue<S> : never;
export type TablePartial<T extends Table<any>> = T extends Table<infer S> ? SchemaPartial<S> : never;
