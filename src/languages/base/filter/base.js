/**
 * Loads utility filters to swig
 */

var swig = require('swig'),
    string = require('string'),
    util = require('util'),
    keysParser = require('../parser/keys'),
    typeParser = require('../parser/type');



swig.setFilter('capitalize', function (input) {
    return string('_' + input).camelize().s;
});

swig.setFilter('dasherize', function (input) {
    return string(input).dasherize().s;
});

swig.setFilter('latinise', function (input) {
    return string(input).latinise().s;
});

swig.setFilter('slugify', function (input) {
    return string(input).slugify().s;
});

swig.setFilter('camelize', function (input) {
    return string(input).camelize().s;
});

swig.setFilter('parseType', function (propertyName, schemas) {
    return typeParser.type(propertyName, schemas);
});
swig.setFilter('parseDoctrineType', function (propertyName, schemas) {
    var type = typeParser.type(propertyName, schemas);
    if (type === 'array') {
        return 'simple_array';
    }
    return type;
});

swig.setFilter('parseLength', function (propertyName) {
    return typeParser.length(propertyName);
});

swig.setFilter('isRequired', function (propertyName, schema) {
    if (!schema.required || typeof schema.required !== 'object') {
        return false;
    }

    return schema.required.indexOf(propertyName) !== -1;
});

swig.setFilter('isPrimaryKey', function (propertyName, schema) {
    var primaryProperty = keysParser.firstPrimaryKey(schema);
    var keyName = primaryProperty ? Object.keys(primaryProperty) : {};
    return keyName && keyName.length ? (keyName[0] === propertyName) : false;
});

var isAutoIncrement = function (property) {
    return property.type === 'integer' && (property.indentity || property.autoIncrement);

};

swig.setFilter('isAutoIncrement', function (propertyName, schema) {
    var primaryProperty = keysParser.firstPrimaryKey(schema);
    var keyName = primaryProperty ? Object.keys(primaryProperty) : {};
    return keyName && keyName.length ? (keyName[0] === propertyName && isAutoIncrement(primaryProperty[keyName])) : false;
});

swig.setFilter('canBeColumn', function (property, schema, schemas) {

    var canBeColumn = true;
    if (property.type === 'array' && property.items) {

        if (!Array.isArray(property.items)) {
            property.items = [property.items];
        }

        property.items.forEach(function (item) {

            if (item.type === 'object') {
                canBeColumn = true;
                return false;
            }
        });

    }

    return canBeColumn;
});

swig.setFilter('commentValue', function (property) {

    if (['file', 'any', 'null', 'array'].indexOf(property.type) !== -1) {
        return util.format(' COMMENT \'(RAMLType:%s)\' ', property.type);
    } else {
        return '';
    }

});

swig.setFilter('defaultValue', function (property) {

    var defaultValue = '';

    if (!isAutoIncrement(property) && property.default && ['text', 'object'].indexOf(property.type) === -1) {

        defaultValue = property.default;

        if (['time', 'date', 'datetime', 'timestamp'].indexOf(property.type) !== -1) {
            var date = Date.create(defaultValue);

            if (date && date.isValid()) {

                switch (property.type) {
                    case 'date':
                        defaultValue = date.format('{yyyy}-{MM}-{dd}');
                        break;
                    case 'datetime':
                    case 'timestamp':
                        defaultValue = date.format('{yyyy}-{MM}-{dd}T{hh}:{mm}:{ss}');
                        break;
                    case 'time':
                        defaultValue = date.format('{hh}:{mm}');
                        break;
                }
            } else {
                return '';
            }

        } else {
            var maxLength = typeParser.length(property);
            defaultValue = defaultValue.toString().replace(/\'/g, '\\\'')
                .to(maxLength);
        }

        defaultValue = ['number', 'integer'].indexOf(property.type) !== -1 ? parseInt(defaultValue, 10) : defaultValue;
        defaultValue = util.format('\'%s\'', defaultValue);
    } else {
        defaultValue = 'null';
    }
    return defaultValue;
});

swig.setFilter('autoIncrements', function (schema, nameSchema) {

    var keys = keysParser.primaryKeys(schema);
    var keysNames = Object.keys(keys);
    if (!keysNames || !keysNames.length) {
        return '';
    }

    var values = [];
    keysNames.forEach(function (name) {
        var property = keys[name];
        if (property.type === 'integer') {
            values.push(util.format('ALTER TABLE `%s` MODIFY COLUMN `%s` %s AUTO_INCREMENT;', nameSchema, name, typeParser.type(property)));
        }
    });

    return values.join('\n');

});

swig.setFilter('entityFromMethod', function (method) {

    var schema = 'NoEntity';
    Object.keys(method.responses || {}).forEach(function (name) {

        Object.keys(method.responses[name].body || {}).forEach(function (type) {

            var responseType = method.responses[name].body[type];
            schema = responseType.schema;

        });

    });

    return schema ? schema.replace('[]', '') : null;

});

swig.setFilter('primaryKeys', function (schema, nameSchema) {

    var keys = keysParser.primaryKeys(schema);
    var keysNames = Object.keys(keys);
    if (!keysNames || !keysNames.length) {
        return '';
    }

    var values = [];
    keysNames.forEach(function (name) {
        values.push(util.format('`%s`', name));
    });

    var constraint = util.format('PRIMARY KEY (%s)', values.join(','));
    var indexName = util.format('%s_PK', nameSchema);
    return util.format('ALTER TABLE `%s` ADD CONSTRAINT `%s` %s;', nameSchema, indexName, constraint);

});

swig.setFilter('uniqueKeys', function (schema, nameSchema) {

    var keys = keysParser.uniqueKeys(schema);
    var keysNames = Object.keys(keys);
    if (!keysNames || !keysNames.length) {
        return '';
    }

    var values = [];
    keysNames.forEach(function (name) {
        var indexName = util.format('%s_%s_UK', nameSchema, name);
        var fragment = util.format('UNIQUE (`%s`)', name);
        values.push(util.format('ALTER TABLE `%s` ADD CONSTRAINT `%s` %s;', nameSchema, indexName, fragment));
    });

    return values.join('\n');

});

swig.setFilter('foreignKeys', function (schema, nameSchema, schemas) {

    var keys = keysParser.foreignKeys(schema, schemas);
    var keysNames = Object.keys(keys);
    if (!keysNames || !keysNames.length) {
        return '';
    }

    var values = [];
    keysNames.forEach(function (name) {

        var property = keys[name];
        if (!property.refObject) {
            return false;
        }

        var propertyReference = property.ref;
        var propertyReferencedKeys = Object.keys(property.refObject);
        var propertyReferencedKeyName = propertyReferencedKeys.length ? propertyReferencedKeys[0] : null;

        var indexName = util.format('%s_%s_FK', nameSchema, name);
        var fragment = util.format('FOREIGN KEY (`%s`) REFERENCES %s(`%s`)', name, propertyReference, propertyReferencedKeyName);
        values.push(util.format('ALTER TABLE `%s` ADD CONSTRAINT `%s` %s ON UPDATE CASCADE ON DELETE CASCADE;', nameSchema, indexName, fragment));

    });

    return values.join('\n');

});




var parseType = function (input) {
    var type = '';
    switch (input) {
        case 'string':
        case 'date':
        case 'text':
        case 'file':
        case 'datetime':
            type = 'String';
            break;
        case 'integer':
            type = 'Number';
            break;
        case 'boolean':
            type = 'Boolean';
            break;
        case 'number':
            type = 'Number';
            break;

    }
    return type;
};
convert = function (json_schema) {

    var mongoose = {};
    Object.keys(json_schema.properties).forEach(function (key) {
        var property = json_schema.properties[key];


        var isRequired = (json_schema.required || []).indexOf(key) !== -1;


        var mongooseProperty = {};


        switch (property.type) {
            case 'string':
            case 'integer':
            case 'boolean':
            case 'date':
            case 'file':
            case 'datetime':
            case 'text':
            case 'number':
                mongooseProperty = {
                    type: parseType(property.type),
                    required: isRequired
                };
                break;
            case 'array':


                var subProperty = property.items[0];
                var subType = subProperty.type;
                if (subType === 'object') {

                    mongooseProperty = [
                        {
                            required: isRequired,
                            type: 'mongoose.Schema.Types.ObjectId',
                            ref: subProperty.ref || subProperty.name
                        }
                    ];

                } else {

                    mongooseProperty = [
                        {
                            type: parseType(subProperty.type),
                            required: isRequired
                        }
                    ];
                }

                break;
            case 'object':
                mongooseProperty = {
                    required: isRequired,
                    type: 'mongoose.Schema.Types.ObjectId',
                    ref: property.ref
                };
                break;

        }


        mongoose[key] = mongooseProperty;


    });
    return mongoose;
};

var toMongoose = function (json_schema) {
    return convert(json_schema);
};


swig.setFilter('toMongoose', function (schema) {


    var schemaString = JSON.stringify(toMongoose(schema));



    schemaString = schemaString.replace(new RegExp('"String"', 'g'), 'String');
    schemaString = schemaString.replace(new RegExp('"Boolean"', 'g'), 'Boolean');
    schemaString = schemaString.replace(new RegExp('"Number"', 'g'), 'Number');
    schemaString = schemaString.replace(new RegExp('"mongoose.Schema.Types.ObjectId"', 'g'), 'mongoose.Schema.Types.ObjectId');

    return schemaString
});