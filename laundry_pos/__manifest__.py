{
    'name': 'Laundry POS',
    'version': '1.1.0',
    'author': 'laundryx',
    'summary': 'Custom laundry service workflow for Point of Sale',
    'category': 'Point of Sale',
    'depends': ['point_of_sale', 'pos_settle_due'],
    'data': [
        'security/ir.model.access.csv',
        'data/laundry_service_type_data.xml',
        'views/pos_order_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'laundry_pos/static/src/**/*.scss',
            'laundry_pos/static/src/**/*.js',
            'laundry_pos/static/src/**/*.xml',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
